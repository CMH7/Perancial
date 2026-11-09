/**
 * Firebase Auth UID of the app's only user. Not a secret (an identifier, like a username).
 * Must match the UID hard-coded in `firestore.rules`; a unit test keeps the two in sync.
 */
export const OWNER_UID = 'nljVk7wwFdO2PFeKwZ1WwAdOn0J2';

export const isOwner = (uid: string | null | undefined) => uid === OWNER_UID;
