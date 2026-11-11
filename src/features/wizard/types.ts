export interface FormData {
  name: string

  groupCode: string

  groupName: string

  /** Every ministry the member asked to join, in the order they submit. */
  groupNames?: string[]
}

/** One ministry (or group code) the member is asking to be added to. */
export interface JoinTarget {
  groupCode: string

  groupName: string

  organizationId?: string
}
