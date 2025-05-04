import { useState, useEffect } from 'react';
import { Map } from './components/Map';

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

  return (
    <div className="h-screen w-screen bg-black text-white overflow-hidden">
      <div className="flex h-screen">
        {/* 左侧按钮区域 */}
        <div className="w-1/4 p-4 space-y-6 overflow-y-auto">
          <button
            className="w-full p-4 bg-blue-600 rounded-lg text-xl font-bold focus:ring-4 focus:ring-blue-400"
            onClick={toggleStream}
            aria-pressed={isStreaming}
          >
            {isStreaming ? "停止实时流" : "开始实时流"}
          </button>

          <button
            className="w-full p-4 bg-green-600 rounded-lg text-xl font-bold focus:ring-4 focus:ring-green-400"
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
            className="w-full p-4 bg-purple-600 rounded-lg text-xl font-bold focus:ring-4 focus:ring-purple-400"
            onClick={startVoiceInput}
          >
            <span role="img" aria-hidden="true">🎤</span> 语音输入目的地
          </button>
        </div>

        {/* 右侧地图区域 */}
        <div className="w-3/4 h-screen relative">
          <Map 
            center={defaultLocation}
            zoom={15}
            isVisible={true}
          />
        </div>
      </div>
    </div>
  );
}
