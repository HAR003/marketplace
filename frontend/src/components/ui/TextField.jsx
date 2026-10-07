import { useId } from 'react'

// A labeled input with a hint or an error message underneath.
// `trailing` is an element placed inside the input on the right (e.g. a button).
export default function TextField({ label, error, hint, trailing, ...inputProps }) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error || hint

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={`block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-xs transition outline-none placeholder:text-slate-400 focus:ring-4 ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'
          } ${trailing ? 'pr-12' : ''}`}
          {...inputProps}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            {trailing}
          </div>
        )}
      </div>
      {message && (
        <p
          id={messageId}
          className={`mt-1.5 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
