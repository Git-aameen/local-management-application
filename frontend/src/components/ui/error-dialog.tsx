import { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// A tiny global pub-sub, deliberately mirroring how sonner's toast() works: any code
// (mutation onError handlers in particular) can call showErrorDialog(message) from
// anywhere without needing to thread dialog-open state through every component. Mount
// <ErrorDialog /> once near the app root (see App.tsx) to render whatever's current.
type Listener = (message: string | null) => void

let currentMessage: string | null = null
const listeners = new Set<Listener>()

/**
 * Shows a centered, must-acknowledge error dialog. Used for mutation failures (create,
 * update, delete) — errors the user needs to actually read to understand why their action
 * didn't go through, as opposed to toast.success(), which stays a lightweight bottom-right
 * confirmation for successful actions.
 */
export function showErrorDialog(message: string) {
  currentMessage = message
  listeners.forEach((listener) => listener(message))
}

function closeErrorDialog() {
  currentMessage = null
  listeners.forEach((listener) => listener(null))
}

export function ErrorDialog() {
  const [message, setMessage] = useState<string | null>(currentMessage)

  useEffect(() => {
    listeners.add(setMessage)
    return () => {
      listeners.delete(setMessage)
    }
  }, [])

  return (
    <AlertDialog open={message !== null} onOpenChange={(open) => !open && closeErrorDialog()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Action failed</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={closeErrorDialog}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
