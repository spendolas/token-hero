/**
 * File-info handler — returns current Figma file metadata.
 */

export interface FileInfoRequest {
  requestId: string;
}

export function handleGetFileInfo({ requestId }: FileInfoRequest) {
  figma.ui.postMessage({
    type: 'GET_FILE_INFO_RESULT',
    requestId,
    payload: {
      figmaFileKey: figma.fileKey ?? '',
      figmaFileName: figma.root.name,
    },
  });
}
