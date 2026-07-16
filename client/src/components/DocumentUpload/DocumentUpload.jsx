import React, { useRef, useState } from 'react';
import { API_URL } from '../../lib/config';
import './DocumentUpload.css';

// ── PDF via pdf.js (Stable v3 Library) ─────────────────────────────────────────
async function extractPdf(file) {
    console.log('[DocumentUpload] Starting PDF extraction:', file.name);

    try {
        if (!window.pdfjsLib) {
            console.log('[DocumentUpload] Loading PDF.js v3.11.174...');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load PDF.js library'));
                document.head.appendChild(script);
            });
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const pdfjsLib = window.pdfjsLib;
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        console.log(`[DocumentUpload] PDF loaded: ${pdf.numPages} pages.`);
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            // PDF.js returns text items in order, but sometimes they need spacing logic
            const pageText = content.items
                .map(item => item.str)
                .join(' ')
                .replace(/\s+/g, ' '); // Normalize whitespace

            fullText += pageText + '\n\n';
        }

        const result = fullText.trim();
        console.log(`[DocumentUpload] Extraction complete. Chars: ${result.length}`);

        if (result.length < 10) {
            throw new Error('This PDF appears to be empty or contains only images (scanned document).');
        }

        return result;
    } catch (err) {
        console.error('[DocumentUpload] PDF Extraction Error:', err);
        throw err;
    }
}

// ── DOCX via mammoth (Stable Library) ─────────────────────────────────────────
async function extractDocx(file) {
    if (!window.mammoth) {
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
        });
    }
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
}

// ── Plain text / CSV / Markdown ───────────────────────────────────────────────
async function extractTxt(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsText(file, 'UTF-8');
    });
}

const DocumentUpload = ({ onDocumentReady, onError, renderCustom }) => {
    const cameraRef = useRef(null);
    const galleryRef = useRef(null);
    const [status, setStatus] = useState('idle');

    const processFile = async (file) => {
        if (!file) return;

        // 10MB Limit
        if (file.size > 10 * 1024 * 1024) {
            onError?.('File too large (max 10 MB).');
            return;
        }

        setStatus('reading');
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let text = '';
            let previewUrl = null;

            if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
                previewUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch(`${API_URL}/api/upload-image`, {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();
                if (data.success && data.url) {
                    text = `### IMAGE CONTEXT: ${file.name}\nUploaded file URL: ${data.url}`;
                    if (data.extracted_text) {
                        text += `\n\nExtracted Text From Image:\n${data.extracted_text}`;
                    }
                } else {
                    throw new Error(data.error || 'Failed to upload image.');
                }
            } else if (ext === 'pdf') {
                text = await extractPdf(file);
            } else if (ext === 'doc' || ext === 'docx') {
                text = await extractDocx(file);
            } else {
                text = await extractTxt(file);
            }

            if (!text || text.trim().length < 5) {
                throw new Error('No readable text found in this document.');
            }

            setStatus('done');
            onDocumentReady?.({
                fileName: file.name,
                fileType: ext,
                text: text.slice(0, 15000), // Increased limit slightly
                size: file.size,
                previewUrl: previewUrl,
            });

            setTimeout(() => {
                setStatus('idle');
                if (cameraRef.current) cameraRef.current.value = '';
                if (galleryRef.current) galleryRef.current.value = '';
            }, 1500);

        } catch (err) {
            console.error('[DocumentUpload] Process Error:', err);
            setStatus('error');
            onError?.(err.message || 'Failed to read document.');
            setTimeout(() => {
                setStatus('idle');
                if (cameraRef.current) cameraRef.current.value = '';
                if (galleryRef.current) galleryRef.current.value = '';
            }, 2000);
        }
    };

    const trigger = (type = "gallery") => {
        if (status === 'reading') return;
        if (type === "camera") {
            cameraRef.current?.click();
        } else {
            galleryRef.current?.click();
        }
    };

    return (
        <div className="doc-upload-root">
            <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => processFile(e.target.files?.[0])}
            />
            <input
                ref={galleryRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                style={{ display: 'none' }}
                onChange={e => processFile(e.target.files?.[0])}
            />
            {renderCustom ? renderCustom(trigger, status) : (
                <button className={`doc-upload-default-btn status-${status}`} onClick={() => trigger("gallery")}>
                    {status === 'reading' ? '⏳' : '📄'}
                </button>
            )}
        </div>
    );
};

export default DocumentUpload;