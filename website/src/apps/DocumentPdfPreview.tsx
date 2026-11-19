import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function decodeBase64(value: string) {
  const binary = atob(value);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
  return data;
}

export function DocumentPdfPreview({
  base64,
  name,
  scale,
  onScaleChange,
}: {
  base64: string;
  name: string;
  scale: number;
  onScaleChange: (scale: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setPdf(null);
    setPageNumber(1);
    let task: pdfjs.PDFDocumentLoadingTask;
    try {
      task = pdfjs.getDocument({ data: decodeBase64(base64) });
    } catch {
      setError('This PDF could not be rendered. Use Download to open the authorized file.');
      setLoading(false);
      return;
    }
    task.promise
      .then((documentProxy) => {
        if (!active) {
          void task.destroy();
          return;
        }
        setPdf(documentProxy);
        setPageCount(documentProxy.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('This PDF could not be rendered. Use Download to open the authorized file.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [base64]);

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !availableWidth) return;
    let active = true;
    let renderTask: pdfjs.RenderTask | undefined;
    setError('');
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (!active || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale: fitScale * (scale / 100) });
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(12_000_000 / (viewport.width * viewport.height)),
        );
        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is not available');
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        return renderTask.promise;
      })
      .catch(() => {
        if (active) setError('This PDF page could not be rendered.');
      });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, scale, availableWidth]);

  return (
    <div className="documents-pdf-viewer" aria-label={`PDF preview of ${name}`}>
      <div className="documents-pdf-toolbar" aria-label="PDF page controls">
        <button
          className="secondary-button"
          aria-label="Previous page"
          disabled={!pdf || pageNumber <= 1}
          onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
        >
          ‹
        </button>
        <span aria-live="polite">
          {loading ? 'Loading PDF…' : error ? 'Preview unavailable' : `Page ${pageNumber} of ${pageCount}`}
        </span>
        <button
          className="secondary-button"
          aria-label="Next page"
          disabled={!pdf || pageNumber >= pageCount}
          onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}
        >
          ›
        </button>
        <button
          className="secondary-button"
          disabled={scale <= 50}
          aria-label="Zoom out"
          onClick={() => onScaleChange(Math.max(50, scale - 10))}
        >
          −
        </button>
        <span>{scale}%</span>
        <button
          className="secondary-button"
          disabled={scale >= 200}
          aria-label="Zoom in"
          onClick={() => onScaleChange(Math.min(200, scale + 10))}
        >
          ＋
        </button>
        <button className="quiet-button" onClick={() => onScaleChange(100)}>
          Reset zoom
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="documents-pdf-page" ref={pageContainerRef}>
          <canvas ref={canvasRef} aria-label={`Page ${pageNumber} of ${pageCount}`} />
        </div>
      )}
    </div>
  );
}
