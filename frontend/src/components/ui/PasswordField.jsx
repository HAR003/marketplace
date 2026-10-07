import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons.jsx'
import TextField from './TextField.jsx'

// A password input with a button that shows or hides what was typed
export default function PasswordField(props) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label="Show password"
          aria-pressed={visible}
          className="rounded-md p-2 text-slate-400 transition hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  )
}
