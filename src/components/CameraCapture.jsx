import { useEffect, useRef, useState } from 'react'

export function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const requestIdRef = useRef(0)
  const [isStarting, setIsStarting] = useState(true)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState('environment')
  const [canFlip, setCanFlip] = useState(false)

  useEffect(() => {
    startCamera(facingMode)

    return () => {
      stopCamera()
    }
  }, [facingMode])

  async function startCamera(nextFacingMode) {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      setIsStarting(true)
      setError('')
      stopCamera({ invalidate: false })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacingMode },
        },
        audio: false,
      })

      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (error) {
          if (requestId !== requestIdRef.current || error?.name === 'AbortError') {
            return
          }
          throw error
        }
      }

      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      setIsActive(true)

      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((device) => device.kind === 'videoinput')
        setCanFlip(videoInputs.length > 1)
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return
      }
      setIsActive(false)
      setError(`Camera access failed: ${err.message}`)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsStarting(false)
      }
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return

    const context = canvasRef.current.getContext('2d')
    if (!context) return

    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    context.drawImage(videoRef.current, 0, 0)

    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return
        onCapture(blob)
        stopCamera()
      },
      'image/jpeg',
      0.95,
    )
  }

  function stopCamera({ invalidate = true } = {}) {
    if (invalidate) {
      requestIdRef.current += 1
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsActive(false)
  }

  function handleFlip() {
    setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))
  }

  function handleCancel() {
    stopCamera()
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-stone-800 bg-stone-950 p-4 text-white shadow-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Take Picture</h2>
            <p className="mt-1 text-sm text-stone-300">
              Capture the ingredients label. The image will be processed with the same Gemini OCR
              flow as file uploads.
            </p>
          </div>
          <button
            className="rounded-full border border-stone-700 px-3 py-2 text-sm font-medium text-stone-200 transition hover:bg-stone-800"
            type="button"
            onClick={handleCancel}
          >
            Close
          </button>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[3/4] w-full object-cover"
          />
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {isStarting ? (
          <p className="mt-4 text-sm text-amber-300">Opening camera preview...</p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="flex-1 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={capturePhoto}
            disabled={!isActive || isStarting}
          >
            Capture photo
          </button>

          {canFlip ? (
            <button
              className="rounded-full border border-stone-700 px-5 py-3 text-sm font-medium text-stone-100 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleFlip}
              disabled={isStarting}
            >
              Flip camera
            </button>
          ) : null}

          <button
            className="rounded-full border border-stone-700 px-5 py-3 text-sm font-medium text-stone-100 transition hover:bg-stone-800"
            type="button"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
