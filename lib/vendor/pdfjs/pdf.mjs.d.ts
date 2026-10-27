interface PdfViewport {
    width: number;
    height: number;
}

interface PdfPageHandle {
    getViewport(params: { scale: number }): PdfViewport;
    render(params: {
        canvasContext: CanvasRenderingContext2D;
        viewport: PdfViewport;
    }): { promise: Promise<void> };
}

interface PdfDocumentHandle {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageHandle>;
    destroy(): Promise<void>;
}

export const GlobalWorkerOptions: { workerSrc: string };

export function getDocument(src: {
    data: ArrayBuffer;
    disableRange?: boolean;
    disableStream?: boolean;
}): {
    promise: Promise<PdfDocumentHandle>;
};
