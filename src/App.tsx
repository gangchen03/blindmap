import { useState, useEffect } from 'react';
import { GoogleMap } from './components/GoogleMap';
import { MapWrapper } from './components/MapWrapper';
import { MapProviderWrapper } from './contexts/MapContext';

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGuidanceActive, setIsGuidanceActive] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // 摄像头控制
  const toggleStream = async () => {
    try {
      if (!isStreaming) {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(mediaStream);
        setIsStreaming(true);
      } else {
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsStreaming(false);
      }
    } catch (error) {
      console.error('摄像头访问错误:', error);
      alert('无法访问摄像头，请确保已授予权限');
    }
  };

  // 语音输入控制
  const startVoiceInput = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        alert(`设置目的地: ${text}`);
      };

      recognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        alert('语音识别失败，请重试');
      };

      recognition.start();
    } else {
      alert('您的浏览器不支持语音识别');
    }
  };

  // 清理摄像头资源
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const defaultLocation: [number, number] = [40.7580, -73.9855];
  const [activeTab, setActiveTab] = useState('controls');

  // Add effect to handle automatic map switching
  useEffect(() => {
    if (isGuidanceActive) {
      setActiveTab('map');
    }
  }, [isGuidanceActive]);

  return (
    <MapProviderWrapper>
      <div className="h-screen w-screen bg-black text-white overflow-hidden">
        {/* Main content area */}
        <div className="h-[calc(100vh-4rem)] relative">
          {/* Control panel view */}
          <div 
            className={`absolute inset-0 p-4 space-y-4 overflow-y-auto transform transition-transform duration-300 ease-in-out bg-black ${
              activeTab === 'controls' ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <button
              className="w-full min-h-[3.5rem] p-4 bg-blue-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-blue-400 active:bg-blue-700 transition-colors touch-manipulation"
              onClick={toggleStream}
              aria-pressed={isStreaming}
            >
              {isStreaming ? "停止实时流" : "开始实时流"}
            </button>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-green-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-green-400 active:bg-green-700 transition-colors touch-manipulation"
              onClick={() => setIsGuidanceActive(!isGuidanceActive)}
              aria-pressed={isGuidanceActive}
            >
              {isGuidanceActive ? "关闭导航模式" : "启用导航模式"}
            </button>

            <div 
              role="status" 
              aria-live="polite"
              className="p-4 bg-gray-800 rounded-lg"
            >
              {isStreaming && <p>摄像头已连接</p>}
              {isStreaming && <p>实时流正在运行</p>}
              {isGuidanceActive && <p>导航模式已激活</p>}
            </div>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-purple-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-purple-400 active:bg-purple-700 transition-colors touch-manipulation"
              onClick={startVoiceInput}
            >
              <span role="img" aria-hidden="true">🎤</span> 语音输入目的地
            </button>
          </div>

          {/* Map view */}
          <div 
            className={`absolute inset-0 transform transition-transform duration-300 ease-in-out ${
              activeTab === 'map' ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <MapWrapper 
              center={defaultLocation}
              zoom={15}
              isVisible={activeTab === 'map'}
            />
          </div>
        </div>

        {/* Bottom navigation bar */}
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-gray-900 flex justify-around items-center shadow-lg">
          <button
            className={`flex-1 h-full flex items-center justify-center ${activeTab === 'controls' ? 'text-blue-500' : 'text-gray-400'}`}
            onClick={() => setActiveTab('controls')}
          >
            <span className="text-2xl">🎛️</span>
            <span className="ml-2">控制台</span>
          </button>
          <button
            className={`flex-1 h-full flex items-center justify-center ${activeTab === 'map' ? 'text-blue-500' : 'text-gray-400'}`}
            onClick={() => setActiveTab('map')}
          >
            <span className="text-2xl">🗺️</span>
            <span className="ml-2">地图</span>
          </button>
        </div>
      </div>
    </MapProviderWrapper>
  );
}
