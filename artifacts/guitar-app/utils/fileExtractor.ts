import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

export type ExtractedFile = {
  text: string;
  source: "text" | "pdf" | "image";
};

export type ExtractProgress = (stage: string, percent?: number) => void;

const TEXT_EXTENSIONS = [".txt", ".tab", ".gp", ".md"];
const PDF_EXTENSIONS = [".pdf"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

function detectKind(name: string, mimeType?: string | null): ExtractedFile["source"] {
  const lower = name.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();

  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.some((e) => lower.endsWith(e))) {
    return "image";
  }
  if (mime === "application/pdf" || PDF_EXTENSIONS.some((e) => lower.endsWith(e))) {
    return "pdf";
  }
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.some((e) => lower.endsWith(e))) {
    return "text";
  }
  // Default: try as text. UploadModal will fall back to whatever the parser returns.
  return "text";
}

async function fetchAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Failed to read file: ${response.status}`);
  return response.arrayBuffer();
}

async function extractPdfText(uri: string, onProgress?: ExtractProgress): Promise<string> {
  if (Platform.OS !== "web") {
    throw new Error(
      "PDF extraction is only supported on the web build. Open the app in a browser to import PDFs."
    );
  }

  onProgress?.("Loading PDF reader", 0);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  onProgress?.("Reading PDF", 10);
  const data = await fetchAsArrayBuffer(uri);
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(
      `Extracting page ${pageNum}/${pdf.numPages}`,
      10 + Math.round((pageNum / pdf.numPages) * 80)
    );
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pageTexts.push(lines);
  }

  onProgress?.("Done", 100);
  return pageTexts.join("\n\n");
}

async function extractImageText(uri: string, onProgress?: ExtractProgress): Promise<string> {
  if (Platform.OS !== "web") {
    throw new Error(
      "Image OCR is only supported on the web build. Open the app in a browser to import images."
    );
  }

  onProgress?.("Loading OCR engine", 0);
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.(m.status, Math.round(m.progress * 100));
    },
  });

  try {
    const { data } = await worker.recognize(uri);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function extractFileText(
  asset: { uri: string; name?: string; mimeType?: string | null },
  onProgress?: ExtractProgress
): Promise<ExtractedFile> {
  const name = asset.name ?? asset.uri.split("/").pop() ?? "";
  const kind = detectKind(name, asset.mimeType);

  switch (kind) {
    case "pdf":
      return { text: await extractPdfText(asset.uri, onProgress), source: "pdf" };
    case "image":
      return { text: await extractImageText(asset.uri, onProgress), source: "image" };
    case "text": {
      const text = await FileSystem.readAsStringAsync(asset.uri);
      return { text, source: "text" };
    }
  }
}
