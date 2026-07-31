import { ImagePlus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { uploadImages } from '../api/client'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export default function ImageUploader({ value = '', onChange, folder, label = 'Image', disabled = false }) {
  const inputId = useId()
  const input = useRef(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const select = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 5 MB or smaller.')
      return
    }
    setUploading(true); setProgress(0); setError('')
    try {
      const uploads = await uploadImages([file], folder, setProgress)
      const uploaded = uploads[0]
      const url = uploaded?.secure_url || uploaded?.url || uploaded?.location
      if (!url) throw new Error('The upload completed without returning an image URL.')
      onChange(url)
      setProgress(100)
    } catch (nextError) {
      setError(nextError.message || 'Unable to upload this image.')
    } finally {
      setUploading(false)
    }
  }

  return <div className="admin-image-uploader">
    <span className="admin-image-label">{label}</span>
    {value ? <div className="admin-image-preview">
      <img src={value} alt={`${label} preview`} />
      <div>
        <button type="button" disabled={disabled || uploading} onClick={() => input.current?.click()}><RefreshCw /> Replace</button>
        <button type="button" className="danger-outline" disabled={disabled || uploading} onClick={() => { setError(''); setProgress(0); onChange('') }}><Trash2 /> Remove</button>
      </div>
    </div> : <label htmlFor={inputId} className={`admin-image-dropzone${disabled ? ' is-disabled' : ''}`}>
      <ImagePlus /><b>{uploading ? 'Uploading image…' : 'Upload image'}</b><small>JPG, PNG or WebP · maximum 5 MB</small>
    </label>}
    <input ref={input} id={inputId} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={select} />
    {uploading && <div className="admin-upload-progress" role="progressbar" aria-label="Image upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><i style={{ width: `${progress}%` }} /><span><Upload /> {progress}%</span></div>}
    {error && <small className="field-error">{error}</small>}
  </div>
}
