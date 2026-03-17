declare module 'expo-sharing' {
  export type IncomingSharedData = {
    contentType: string;
    mimeType?: string | null;
    fileUri?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    text?: string | null;
    webUrl?: string | null;
  };

  export function useIncomingShare(): {
    incomingSharedPayload: IncomingSharedData | null;
    clearIncomingShare: () => void;
  };
}
