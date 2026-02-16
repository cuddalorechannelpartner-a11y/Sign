
import { GoogleGenAI } from "@google/genai";

/**
 * Uses Gemini AI to isolate the foreground subject.
 * Mimics remove.bg by combining AI isolation with advanced alpha-masking.
 */
export async function removeBackground(base64Image: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: 'image/png',
            },
          },
          {
            text: "Act as a professional background removal service. Identify the primary foreground subject and extract it with sharp, clean edges. Preserve all original colors and textures of the subject. Replace everything else (the entire background) with pure #FFFFFF white. Ensure no shadows or artifacts remain. The output must be the subject perfectly centered on a white canvas.",
          },
        ],
      }
    });

    let cleanedBase64 = base64Image;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        cleanedBase64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
    
    return await convertToHighQualityTransparent(cleanedBase64);
  } catch (error) {
    console.error("Gemini Background Removal Error:", error);
    return await convertToHighQualityTransparent(base64Image);
  }
}

/**
 * Advanced transparency engine.
 * Handles anti-aliased edges and prevents 'halo' effects by calculating 
 * per-pixel alpha based on luminance distance from pure white.
 */
async function convertToHighQualityTransparent(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // We iterate through pixels to find 'white' background and convert to alpha
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const luminance = (r + g + b) / 3;
        
        // Threshold for 'whiteness'
        if (luminance > 245) {
          data[i + 3] = 0; // Transparent
        } else if (luminance > 200) {
          // Smooth edge blending (Anti-aliasing protection)
          const alpha = ((255 - luminance) / 55) * 255;
          data[i + 3] = Math.min(data[i+3], alpha);
          
          // Color decontamination: push near-white edges towards subject color
          // to prevent the 'white halo' effect
          const factor = alpha / 255;
          data[i] *= factor;
          data[i+1] *= factor;
          data[i+2] *= factor;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
