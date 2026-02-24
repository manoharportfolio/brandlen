import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, Search, ShieldAlert, CheckCircle, AlertTriangle, Loader2, Camera, X } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

interface AnalysisResult {
  brandName: string;
  companyInfo: string;
  foundingBackground: string;
  symbolicMeaning: string;
  similarityPercentage: number;
  originalityInterpretation: string;
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      setSelectedFile(null);
      setPreviewUrl(null);
      setAnalysis(null);
      setError(null);
    } catch (err: any) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            stopCamera();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setAnalysis(null);
      setError(null);
      setReportSuccess(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setAnalysis(null);
      setError(null);
      setReportSuccess(false);
    }
  };

  const analyzeLogo = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          
          const imagePart = {
            inlineData: {
              mimeType: selectedFile.type,
              data: base64Data,
            },
          };

          const prompt = `Analyze the provided logo image.
Identify the brand and provide the following details:
1. Brand Name
2. Company Info (Brief information about the company)
3. Founding Background (When and how the company was founded)
4. Symbolic Meaning (What the logo symbolizes)
5. Similarity Percentage (AI-estimated similarity percentage to the known original logo, 0-100)
6. Originality Interpretation (Explanation of whether the logo appears original or potentially modified based on the similarity percentage and visual cues.)

If the logo is completely unrecognizable, provide a best guess or state that it is unknown.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [imagePart, { text: prompt }] },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  brandName: { type: Type.STRING },
                  companyInfo: { type: Type.STRING },
                  foundingBackground: { type: Type.STRING },
                  symbolicMeaning: { type: Type.STRING },
                  similarityPercentage: { type: Type.NUMBER },
                  originalityInterpretation: { type: Type.STRING },
                },
                required: ['brandName', 'companyInfo', 'foundingBackground', 'symbolicMeaning', 'similarityPercentage', 'originalityInterpretation'],
              },
            },
          });

          const resultText = response.text;
          if (!resultText) {
            throw new Error('No response from Gemini API');
          }

          const result = JSON.parse(resultText);
          setAnalysis(result);
        } catch (err: any) {
          console.error('Error analyzing logo:', err);
          setError(err.message || 'Failed to analyze logo');
        } finally {
          setIsAnalyzing(false);
        }
      };
      
      reader.onerror = () => {
        setError('Failed to read file');
        setIsAnalyzing(false);
      };
    } catch (err: any) {
      setError(err.message);
      setIsAnalyzing(false);
    }
  };

  const reportLogo = async () => {
    if (!analysis || !selectedFile) return;

    setIsReporting(true);
    setError(null);

    try {
      // Convert file to base64 for reporting
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        const response = await fetch('/api/report-logo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            analysis,
            imageBase64: base64,
            mimeType: selectedFile.type,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to report logo');
        }

        setReportSuccess(true);
        setIsReporting(false);
      };
      
      reader.onerror = () => {
        throw new Error('Failed to read file');
      };
    } catch (err: any) {
      setError(err.message);
      setIsReporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Search className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">BrandLens</h1>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-neutral-500">
            <a href="#" className="hover:text-neutral-900 transition-colors">How it works</a>
            <a href="#" className="hover:text-neutral-900 transition-colors">About</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-4xl font-bold tracking-tight text-neutral-900 mb-4">
            Identify and verify any brand logo
          </h2>
          <p className="text-lg text-neutral-600">
            Upload a logo to instantly discover its brand identity, history, and check for potential modifications or inauthenticity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="text-lg font-medium text-neutral-900 mb-4">Upload Logo</h3>
              
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  previewUrl ? 'border-indigo-200 bg-indigo-50/50' : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50'
                }`}
              >
                {!isCameraActive && (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                )}
                
                {isCameraActive ? (
                  <div className="space-y-4">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <canvas ref={canvasRef} className="hidden" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stopCamera();
                        }}
                        className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        capturePhoto();
                      }}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Camera className="w-5 h-5" />
                      Take Photo
                    </button>
                  </div>
                ) : previewUrl ? (
                  <div className="space-y-4">
                    <img
                      src={previewUrl}
                      alt="Logo preview"
                      className="max-h-48 mx-auto object-contain rounded-lg"
                    />
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startCamera();
                        }}
                        className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Retake
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e: any) => handleFileSelect(e);
                          input.click();
                        }}
                        className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload New
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="mx-auto w-16 h-16 bg-white rounded-full shadow-sm border border-neutral-200 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-neutral-400" />
                    </div>
                    <div>
                      <p className="text-base font-medium text-neutral-900">Scan a logo</p>
                      <p className="text-sm text-neutral-500 mt-1">Take a photo or upload an image</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startCamera();
                        }}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Camera className="w-5 h-5" />
                        Open Camera
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e: any) => handleFileSelect(e);
                          input.click();
                        }}
                        className="px-6 py-2.5 bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Upload className="w-5 h-5" />
                        Upload Image
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={analyzeLogo}
                disabled={!selectedFile || isAnalyzing}
                className={`w-full mt-6 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                  !selectedFile || isAnalyzing
                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Logo...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Analyze Logo
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-3 border border-red-100">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            {analysis ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden"
              >
                <div className="p-6 sm:p-8 border-b border-neutral-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-neutral-900">
                        {analysis.brandName}
                      </h2>
                      <p className="text-neutral-500 mt-1 text-lg">Brand Analysis Report</p>
                    </div>
                    
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-sm font-medium text-neutral-700 mb-2">
                        Similarity Score
                      </div>
                      <div className="flex items-baseline justify-end gap-1">
                        <span className={`text-3xl font-bold tracking-tight ${
                          analysis.similarityPercentage >= 90 ? 'text-emerald-600' :
                          analysis.similarityPercentage >= 70 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {analysis.similarityPercentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-8">
                  <section>
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Company Information</h3>
                    <p className="text-neutral-700 leading-relaxed">{analysis.companyInfo}</p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Founding Background</h3>
                    <p className="text-neutral-700 leading-relaxed">{analysis.foundingBackground}</p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">Symbolic Meaning</h3>
                    <p className="text-neutral-700 leading-relaxed">{analysis.symbolicMeaning}</p>
                  </section>

                  <div className={`p-5 rounded-xl border ${
                    analysis.similarityPercentage >= 90 ? 'bg-emerald-50 border-emerald-100' :
                    analysis.similarityPercentage >= 70 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                  }`}>
                    <div className="flex items-start gap-3">
                      {analysis.similarityPercentage >= 90 ? (
                        <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                      ) : analysis.similarityPercentage >= 70 ? (
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className={`font-medium ${
                          analysis.similarityPercentage >= 90 ? 'text-emerald-900' :
                          analysis.similarityPercentage >= 70 ? 'text-amber-900' : 'text-red-900'
                        }`}>Authenticity Assessment</h4>
                        <p className={`mt-1 text-sm ${
                          analysis.similarityPercentage >= 90 ? 'text-emerald-700' :
                          analysis.similarityPercentage >= 70 ? 'text-amber-700' : 'text-red-700'
                        }`}>
                          {analysis.originalityInterpretation}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 bg-neutral-50 border-t border-neutral-100">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-neutral-500">
                      Does this logo look suspicious or misleading?
                    </p>
                    <button
                      onClick={reportLogo}
                      disabled={isReporting || reportSuccess}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        reportSuccess
                          ? 'bg-emerald-100 text-emerald-700 cursor-default'
                          : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-sm'
                      }`}
                    >
                      {reportSuccess ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Report Submitted
                        </>
                      ) : isReporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4" />
                          Report Suspicious Logo
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-neutral-100 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-neutral-300" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No Analysis Yet</h3>
                <p className="text-neutral-500 max-w-sm">
                  Upload a logo image and click "Analyze Logo" to see the brand details, history, and authenticity assessment here.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
