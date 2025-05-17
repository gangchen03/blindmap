// services/pcm-processor.js
class PcmProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super(options);
      this._buffer = []; // Array to store Float32Array chunks
      this._currentFrameInChunk = 0; // Tracks position within the current chunk
      
      // Expected sample rate from the main thread (e.g., 24000)
      // This is mostly for reference here; the AudioContext's sampleRate is the master.
      this._processorSampleRate = options?.processorOptions?.sampleRate || 24000;
  
      this.port.onmessage = (event) => {
        if (event.data instanceof Float32Array) {
          this._buffer.push(event.data);
        } else if (event.data.command === 'reset') {
          this._buffer = [];
          this._currentFrameInChunk = 0;
        }
      };
    }
  
    process(inputs, outputs, parameters) {
      const output = outputs[0]; // Assuming one output
      const outputChannel = output[0]; // Assuming mono output
  
      if (this._buffer.length === 0) {
        // Fill with silence if buffer is empty
        for (let i = 0; i < outputChannel.length; i++) {
          outputChannel[i] = 0;
        }
        return true; // Keep processor alive
      }
  
      let framesToFill = outputChannel.length;
      let filledFrames = 0;
  
      while (filledFrames < framesToFill && this._buffer.length > 0) {
        const currentChunk = this._buffer[0];
        const framesLeftInChunk = currentChunk.length - this._currentFrameInChunk;
        const framesToCopy = Math.min(framesToFill - filledFrames, framesLeftInChunk);
  
        for (let i = 0; i < framesToCopy; i++) {
          outputChannel[filledFrames + i] = currentChunk[this._currentFrameInChunk + i];
        }
  
        this._currentFrameInChunk += framesToCopy;
        filledFrames += framesToCopy;
  
        if (this._currentFrameInChunk >= currentChunk.length) {
          this._buffer.shift(); // Remove processed chunk
          this._currentFrameInChunk = 0;
        }
      }
  
      // If buffer ran out mid-way, fill remaining output with silence
      for (let i = filledFrames; i < framesToFill; i++) {
        outputChannel[i] = 0;
      }
  
      return true; // Keep processor alive
    }
  }
  
  registerProcessor('pcm-processor', PcmProcessor);
  