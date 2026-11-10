import { useState } from "react"

import type { FormData } from "./types"

import { INITIAL_FORM } from "./data"

export function useWizard() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM)

  const [firstName, setFirstName] = useState("")

  const [lastName, setLastName] = useState("")

  function updateForm(partial: Partial<FormData>) {
    setForm((f) => ({ ...f, ...partial }))
  }

  /** Called when the member leaves the name step. */

  function saveName() {
    updateForm({ name: `${firstName} ${lastName}`.trim() })
  }

  function reset() {
    setForm(INITIAL_FORM)

    setFirstName("")

    setLastName("")
  }

  return {
    form,
    updateForm,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    saveName,
    reset,
  }
}
