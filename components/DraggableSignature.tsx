
import React, { useState, useRef, useEffect } from 'react';
import { SignatureData } from '../types';

interface Props {
  data: SignatureData;
  onUpdate: (id: string, updates: Partial<SignatureData>) => void;
  onRemove: (id: string) => void;
  onCrop: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const DraggableSignature: React.FC<Props> = ({ 
  data, 
  onUpdate, 
  onRemove, 
  onCrop, 
  containerRef 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  
  const startPos = useRef({ x: 0, y: 0 });
  const startDim = useRef({ w: 0, h: 0 });
  const startRot = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = { x: e.clientX - data.x, y: e.clientY - data.y };
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startPos.current = { x: e.clientX, y: e.clientY };
    startDim.current = { w: data.width, h: data.height };
  };

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
    
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    startRot.current = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - data.rotation;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        let newX = e.clientX - startPos.current.x;
        let newY = e.clientY - startPos.current.y;
        
        newX = Math.max(0, Math.min(newX, rect.width - data.width));
        newY = Math.max(0, Math.min(newY, rect.height - data.height));

        onUpdate(data.id, { x: newX, y: newY });
      }

      if (isResizing) {
        const deltaX = e.clientX - startPos.current.x;
        const ratio = startDim.current.w / startDim.current.h;
        const newWidth = Math.max(40, startDim.current.w + deltaX);
        const newHeight = newWidth / ratio;
        
        onUpdate(data.id, { width: newWidth, height: newHeight });
      }

      if (isRotating) {
        const element = document.getElementById(`sig-${data.id}`);
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        onUpdate(data.id, { rotation: angle - startRot.current });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setIsRotating(false);
    };

    if (isDragging || isResizing || isRotating) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, isRotating, data, onUpdate, containerRef]);

  return (
    <div
      id={`sig-${data.id}`}
      className="group"
      style={{
        position: 'absolute',
        left: data.x,
        top: data.y,
        width: data.width,
        height: data.height,
        cursor: isDragging ? 'grabbing' : 'grab',
        border: isDragging || isResizing || isRotating ? '2px solid #3b82f6' : '1px dashed rgba(59, 130, 246, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        zIndex: 10,
        transform: `rotate(${data.rotation}deg)`,
        transition: 'border 0.2s ease'
      }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
      onMouseDown={handleMouseDown}
    >
      <img 
        src={data.url} 
        alt={data.type} 
        className="max-w-full max-h-full pointer-events-none drop-shadow-sm grayscale" 
      />
      
      {/* Label */}
      <div className="absolute -top-6 left-0 bg-gray-900 text-white text-[8px] px-2 py-0.5 rounded-sm uppercase font-bold tracking-widest pointer-events-none">
        {data.type}
      </div>

      {/* Rotation Handle */}
      <div
        className="absolute -top-10 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full cursor-alias flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={handleRotateMouseDown}
      >
        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
        <div className="absolute top-4 w-0.5 h-4 bg-blue-600"></div>
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 bg-blue-600 cursor-se-resize rounded-tl-lg flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={handleResizeMouseDown}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 13v6m0 0h-6m6 0L13 13" />
        </svg>
      </div>

      {/* Main Toolbar */}
      {(showToolbar || isDragging || isResizing || isRotating) && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex bg-white border border-gray-100 shadow-xl rounded-full px-2 py-1 gap-1 z-50">
          <button 
            onClick={(e) => { e.stopPropagation(); onCrop(data.id); }}
            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Crop Image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l4.121 4.121" />
            </svg>
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(data.id); }}
            className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
