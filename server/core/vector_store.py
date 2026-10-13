import os
import time
import uuid
import requests
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

CHROMA_DIR = "vector_db"
COLLECTION_NAME = "meeting_transcript"

# Embedding engine:
#   "mistral" → Mistral's mistral-embed API (default when MISTRAL_API_KEY is set; no PyTorch needed)
#   "local"   → all-MiniLM-L6-v2 via sentence-transformers (install requirements-local.txt)
EMBEDDINGS = os.getenv("EMBEDDINGS", "").lower() or ("mistral" if os.getenv("MISTRAL_API_KEY") else "local")
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MISTRAL_EMBED_MODEL = os.getenv("MISTRAL_EMBED_MODEL", "mistral-embed")


class MistralEmbeddings(Embeddings):
    """Minimal client for Mistral's embeddings endpoint (batched, retries on rate limits)."""

    url = "https://api.mistral.ai/v1/embeddings"
    batch_size = 32

    def __init__(self, model: str = MISTRAL_EMBED_MODEL):
        self.model = model
        self.api_key = os.getenv("MISTRAL_API_KEY")
        if not self.api_key:
            raise RuntimeError("MISTRAL_API_KEY is not set in environment / .env")

    def _embed(self, texts: list[str]) -> list[list[float]]:
        for attempt in range(4):
            response = requests.post(
                self.url,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"model": self.model, "input": texts},
                timeout=120,
            )
            if response.status_code == 429 and attempt < 3:
                time.sleep(2 * (attempt + 1))
                continue
            if not response.ok:
                print(f"\n❌ Mistral embeddings returned {response.status_code}")
                print(f"Response body: {response.text}\n")
                response.raise_for_status()
            data = sorted(response.json()["data"], key=lambda d: d["index"])
            return [d["embedding"] for d in data]
        return []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            vectors.extend(self._embed(texts[i : i + self.batch_size]))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]


def get_embeddings():
    if EMBEDDINGS == "mistral":
        return MistralEmbeddings()
    from langchain_community.embeddings import HuggingFaceEmbeddings  # only needed for the local engine

    return HuggingFaceEmbeddings(
        model_name = EMBEDDING_MODEL,
        model_kwargs = {"device" : 'cpu'}
    )

def build_vector_store(transcript : str)->Chroma:
    print("Building vector Store")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size = 500,
        chunk_overlap = 50
    )
    chunks = splitter.split_text(transcript)

    docs = [
        Document(page_content=chunk, metadata = {'chunk_index' : i})
        for i,chunk in enumerate(chunks)
    ]

    embeddings = get_embeddings()
    # One collection per video, so a chat only ever searches its own transcript
    # (and collections built with different embedding models never mix).
    vector_store = Chroma.from_documents(
        documents= docs,
        embedding=embeddings,
        collection_name=f"{COLLECTION_NAME}_{uuid.uuid4().hex[:12]}",
        persist_directory=CHROMA_DIR
    )

    return vector_store



def load_vector_store() ->Chroma:
    embeddings = get_embeddings()
    vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function= embeddings,
        persist_directory=CHROMA_DIR
    )

    return vector_store

def get_retriever(vector_store : Chroma, k :int = 4):
    return vector_store.as_retriever(
        search_type = 'similarity',
        search_kwargs = {"k":k}
    )
