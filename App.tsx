
import React, { useState, useEffect, useRef } from 'react';
import { ViewMode, SignatureData, DocumentLog, AdminSettings } from './types';
import { embedSignaturesInPdf, getPdfPageAsImage, PageInfo } from './services/pdfService';
import { DraggableSignature } from './components/DraggableSignature';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.EDITOR);
  const [userName, setUserName] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [signatures, setSignatures] = useState<SignatureData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [logs, setLogs] = useState<DocumentLog[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({ companySealUrl: null });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');

  // Cropping State
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isSelectingCrop, setIsSelectingCrop] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedLogs = localStorage.getItem('sign_edit_logs');
    if (savedLogs) setLogs(JSON.parse(savedLogs));
    
    const savedSettings = localStorage.getItem('sign_edit_settings');
    if (savedSettings) setAdminSettings(JSON.parse(savedSettings));
  }, []);

  const saveLog = (fileName: string) => {
    const newLog: DocumentLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleString(),
      userName: userName || 'Anonymous',
      fileName
    };
    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('sign_edit_logs', JSON.stringify(updatedLogs));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      setProcessingStatus('Analyzing PDF structure...');
      try {
        setPdfFile(file);
        const arrayBuffer = await file.arrayBuffer();
        const info = await getPdfPageAsImage(arrayBuffer);
        setPageInfo(info);
        setSignatures([]);
      } catch (err) {
        console.error("PDF Rendering Error:", err);
        alert("Could not load PDF preview. Please try another file.");
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
      }
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'consumer' | 'witness') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingStatus(`Loading ${type} signature...`);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        const targetWidth = 180;
        const targetHeight = targetWidth / ratio;

        const newSig: SignatureData = {
          id: Math.random().toString(36).substr(2, 9),
          type,
          url: base64,
          x: 50 + (signatures.length * 30),
          y: 50 + (signatures.length * 30),
          width: targetWidth,
          height: targetHeight,
          rotation: 0
        };
        setSignatures([...signatures, newSig]);
        setIsProcessing(false);
        setProcessingStatus('');
      };
      img.src = base64;
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const addSeal = () => {
    if (!adminSettings.companySealUrl) return alert("Please configure a company seal in Admin Dashboard.");
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const targetWidth = 120;
      const targetHeight = targetWidth / ratio;
      const newSig: SignatureData = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'seal',
        url: adminSettings.companySealUrl!,
        x: 100,
        y: 100,
        width: targetWidth,
        height: targetHeight,
        rotation: 0
      };
      setSignatures([...signatures, newSig]);
    };
    img.src = adminSettings.companySealUrl;
  };

  const updateSignature = (id: string, updates: Partial<SignatureData>) => {
    setSignatures(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSignature = (id: string) => {
    setSignatures(prev => prev.filter(s => s.id !== id));
  };

  const startCropping = (id: string) => {
    const sig = signatures.find(s => s.id === id);
    if (!sig) return;
    setCroppingId(id);
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        if (cropCanvasRef.current) {
            const canvas = cropCanvasRef.current;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            setCropRect({ x: 0, y: 0, w: img.width, h: img.height });
        }
    };
    img.src = sig.url;
  };

  const handleCropMouseDown = (e: React.MouseEvent) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    setCropRect({ x, y, w: 0, h: 0 });
    setIsSelectingCrop(true);
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isSelectingCrop || !cropCanvasRef.current) return;
    const canvas = cropCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    setCropRect(prev => ({ ...prev, w: x - prev.x, h: y - prev.y }));
  };

  const handleCropMouseUp = () => setIsSelectingCrop(false);

  const applyCrop = () => {
    if (!croppingId || !cropCanvasRef.current) return;
    const originalCanvas = cropCanvasRef.current;
    
    const x = cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x;
    const y = cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y;
    const w = Math.abs(cropRect.w);
    const h = Math.abs(cropRect.h);

    if (w < 5 || h < 5) return;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx?.drawImage(originalCanvas, x, y, w, h, 0, 0, w, h);
    
    const croppedUrl = cropCanvas.toDataURL('image/png');
    const originalSig = signatures.find(s => s.id === croppingId);
    if (originalSig) {
        const scaleChangeX = w / originalCanvas.width;
        const scaleChangeY = h / originalCanvas.height;
        updateSignature(croppingId, { 
            url: croppedUrl,
            width: originalSig.width * scaleChangeX,
            height: originalSig.height * scaleChangeY
        });
    }
    setCroppingId(null);
  };

  const handleSavePdf = async () => {
    if (!pdfFile || !editorRef.current || !userName.trim()) return;
    setIsProcessing(true);
    setProcessingStatus('Generating B&W Document...');
    try {
      const pdfBytes = await pdfFile.arrayBuffer();
      const { width, height } = editorRef.current.getBoundingClientRect();
      const resultBytes = await embedSignaturesInPdf(pdfBytes, signatures, width, height);
      const blob = new Blob([resultBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Signed_BW_${pdfFile.name}`;
      link.click();
      saveLog(pdfFile.name);
    } catch (err) {
      console.error(err);
      alert("Failed to export.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === 'admin123') {
      setIsLoggedIn(true);
      setView(ViewMode.ADMIN_DASHBOARD);
    } else {
      alert("Try 'admin123'");
    }
  };

  const handleSealUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const newSettings = { ...adminSettings, companySealUrl: url };
        setAdminSettings(newSettings);
        localStorage.setItem('sign_edit_settings', JSON.stringify(newSettings));
      };
      reader.readAsDataURL(file);
    }
  };

  const getEditorStyle = () => {
    if (!pageInfo) return { width: '595px', height: '842px' };
    const maxWidth = 1000;
    const maxHeight = 850;
    const ratio = pageInfo.width / pageInfo.height;
    let w = pageInfo.width;
    let h = pageInfo.height;
    if (w > maxWidth) { w = maxWidth; h = w / ratio; }
    if (h > maxHeight) { h = maxHeight; w = h * ratio; }
    return {
      width: `${w}px`,
      height: `${h}px`,
      backgroundImage: `url(${pageInfo.url})`,
      backgroundSize: '100% 100%',
      position: 'relative' as const,
      backgroundColor: 'white'
    };
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#F9FAFB]">
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView(ViewMode.EDITOR)}>
          <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
             </svg>
          </div>
          <h1 className="text-xl font-black">SIGN<span className="text-blue-600">PRO</span></h1>
        </div>
        <nav className="flex bg-gray-100 p-1.5 rounded-2xl">
          <button onClick={() => setView(ViewMode.EDITOR)} className={`px-6 py-2 rounded-xl text-sm font-bold ${view === ViewMode.EDITOR ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500'}`}>Editor</button>
          <button onClick={() => setView(isLoggedIn ? ViewMode.ADMIN_DASHBOARD : ViewMode.ADMIN_LOGIN)} className={`px-6 py-2 rounded-xl text-sm font-bold ${view !== ViewMode.EDITOR ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500'}`}>Admin</button>
        </nav>
      </header>

      <main className="flex-1 p-6 md:p-10">
        {view === ViewMode.EDITOR && (
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-10">
            <div className="xl:col-span-3 space-y-6">
              <section className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">
                <h3 className="font-black text-gray-800 uppercase tracking-tight text-lg">Configuration</h3>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Step 1: Document</label>
                  <input type="file" accept=".pdf" onChange={handlePdfUpload} className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Step 2: Assets</label>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="relative">
                      <input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e, 'consumer')} className="block w-full text-[10px] text-transparent file:w-full file:bg-gray-50 file:border file:border-gray-200 file:py-3 file:rounded-xl file:text-gray-600 file:font-bold hover:file:bg-gray-100 cursor-pointer" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] font-bold text-gray-400 uppercase">Upload Consumer Sign</div>
                    </div>
                    <div className="relative">
                      <input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e, 'witness')} className="block w-full text-[10px] text-transparent file:w-full file:bg-gray-50 file:border file:border-gray-200 file:py-3 file:rounded-xl file:text-gray-600 file:font-bold hover:file:bg-gray-100 cursor-pointer" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] font-bold text-gray-400 uppercase">Upload Witness Sign</div>
                    </div>
                  </div>
                  <button onClick={addSeal} className="w-full py-3 border-2 border-gray-900 rounded-xl text-[10px] font-black uppercase hover:bg-gray-900 hover:text-white transition">Import Company Seal</button>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Step 3: User Info <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    placeholder="Operator Name (Mandatory)" 
                    value={userName} 
                    onChange={(e) => setUserName(e.target.value)} 
                    className={`w-full px-4 py-3 bg-gray-50 rounded-xl outline-none text-sm font-bold border ${!userName.trim() ? 'border-red-200 focus:border-red-400' : 'border-transparent focus:border-blue-200'} transition`} 
                  />
                  {!userName.trim() && <p className="text-[9px] text-red-500 font-bold uppercase mt-1">Operator name is required to export</p>}
                </div>
              </section>
              
              <button 
                disabled={!pdfFile || isProcessing || !userName.trim()} 
                onClick={handleSavePdf} 
                className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase shadow-xl hover:bg-blue-700 disabled:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Export Final PDF</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
              <p className="text-[9px] text-gray-400 font-bold text-center uppercase tracking-widest leading-relaxed">Assets will be rendered in Black & White for professional output.</p>
            </div>
            
            <div className="xl:col-span-9 bg-[#E5E7EB] rounded-[40px] flex items-center justify-center min-h-[850px] p-10 overflow-auto relative">
              {pageInfo ? (
                <div ref={editorRef} className="shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]" style={getEditorStyle()}>
                  {signatures.map(sig => (
                    <DraggableSignature 
                      key={sig.id} 
                      data={sig} 
                      containerRef={editorRef} 
                      onUpdate={updateSignature} 
                      onRemove={removeSignature} 
                      onCrop={startCropping}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto text-gray-300 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-gray-400 font-bold uppercase tracking-widest text-sm">Waiting for Document...</div>
                </div>
              )}
              
              {isProcessing && (
                <div className="absolute inset-0 bg-white/60 z-[100] flex flex-col items-center justify-center backdrop-blur-sm transition-all">
                  <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
                    <p className="font-black uppercase tracking-widest text-xs text-gray-900">{processingStatus}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {croppingId && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-10 backdrop-blur-md">
                <div className="bg-white rounded-[40px] p-8 max-w-4xl w-full flex flex-col gap-6 shadow-2xl">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l4.121 4.121" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tight">Refine Asset Area</h3>
                        </div>
                        <button onClick={() => setCroppingId(null)} className="text-gray-400 hover:text-red-500 font-bold text-xs uppercase transition-colors tracking-widest">Cancel</button>
                    </div>
                    
                    <div className="relative bg-gray-50 rounded-2xl overflow-hidden cursor-crosshair flex items-center justify-center border border-gray-100" style={{ height: '500px' }}>
                        <div className="relative inline-block">
                          <canvas ref={cropCanvasRef} onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} className="max-w-full max-h-[500px] shadow-lg" />
                          {isSelectingCrop && cropCanvasRef.current && (
                              <div style={{
                                  position: 'absolute',
                                  border: '2px dashed #3b82f6',
                                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                  pointerEvents: 'none',
                                  left: `${(Math.min(cropRect.x, cropRect.x + cropRect.w) / cropCanvasRef.current.width) * cropCanvasRef.current.clientWidth}px`,
                                  top: `${(Math.min(cropRect.y, cropRect.y + cropRect.h) / cropCanvasRef.current.height) * cropCanvasRef.current.clientHeight}px`,
                                  width: `${(Math.abs(cropRect.w) / cropCanvasRef.current.width) * cropCanvasRef.current.clientWidth}px`,
                                  height: `${(Math.abs(cropRect.h) / cropCanvasRef.current.height) * cropCanvasRef.current.clientHeight}px`
                              }} />
                          )}
                        </div>
                    </div>
                    
                    <button onClick={applyCrop} className="w-full py-4 bg-gray-900 text-white font-black uppercase rounded-2xl hover:bg-black transition-all shadow-xl active:scale-[0.98]">Confirm Selection</button>
                </div>
            </div>
        )}

        {view === ViewMode.ADMIN_LOGIN && (
          <div className="max-w-md mx-auto mt-20 bg-white p-12 rounded-[48px] shadow-2xl border border-gray-100">
            <h2 className="text-3xl font-black text-center mb-10 tracking-tight uppercase">Admin Vault</h2>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-2">Secure Key</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-center font-bold outline-none focus:border-blue-400 transition" placeholder="••••••••" />
              </div>
              <button type="submit" className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition active:scale-95">Authenticate</button>
            </form>
          </div>
        )}

        {view === ViewMode.ADMIN_DASHBOARD && (
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="bg-white p-10 rounded-[40px] shadow-xl flex justify-between items-center border border-gray-100">
               <h2 className="text-3xl font-black uppercase tracking-tight text-blue-600">Operational Center</h2>
               <button onClick={() => setView(ViewMode.EDITOR)} className="px-6 py-3 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition">Close Session</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="bg-white p-10 rounded-[40px] shadow-xl space-y-6 border border-gray-100">
                  <h3 className="font-black uppercase tracking-widest text-xs text-gray-400">Master Asset: Company Seal</h3>
                  <div className="h-48 flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-4">
                    {adminSettings.companySealUrl ? (
                      <img src={adminSettings.companySealUrl} className="max-h-full object-contain drop-shadow-lg grayscale" />
                    ) : (
                      <span className="text-gray-300 font-bold uppercase text-[10px]">No Asset Defined</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Update Master Asset</label>
                    <input type="file" onChange={handleSealUpload} className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
                  </div>
               </div>
               <div className="bg-white p-10 rounded-[40px] shadow-xl space-y-6 border border-gray-100 flex flex-col">
                  <h3 className="font-black uppercase tracking-widest text-xs text-gray-400">Activity Logs (Audit Trail)</h3>
                  <div className="flex-1 max-h-[400px] overflow-auto space-y-3 pr-2 custom-scrollbar">
                    {logs.length > 0 ? logs.map(l => (
                      <div key={l.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1 transition hover:bg-white hover:shadow-md">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-gray-900 uppercase">{l.userName}</span>
                          <span className="text-[9px] text-gray-400 font-mono">{l.timestamp}</span>
                        </div>
                        <span className="text-[11px] text-blue-600 font-bold truncate">{l.fileName}</span>
                      </div>
                    )) : (
                      <div className="h-full flex items-center justify-center text-gray-300 font-bold uppercase text-[10px]">No Logs Recorded</div>
                    )}
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className="p-10 text-center">
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.4em]">SignEdit Pro Security Suite &bull; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;
