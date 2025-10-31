export type WsAction =
  | { type: 'SET_ROOM'; roomId: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'CONNECTING' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'JOINED'; roomId: string }
  | { type: 'APPEND_LOG'; line: string }
  | { type: 'SET_INPUT'; input: string }
  | { type: 'SET_MEMBERS'; members: string[] }

export const setRoom = (roomId: string): WsAction => ({ type: 'SET_ROOM', roomId });
export const setName = (name: string): WsAction => ({ type: 'SET_NAME', name });
export const connecting = (): WsAction => ({ type: 'CONNECTING' });
export const connected = (): WsAction => ({ type: 'CONNECTED' });
export const disconnected = (): WsAction => ({ type: 'DISCONNECTED' });
export const joined = (roomId: string): WsAction => ({ type: 'JOINED', roomId });
export const appendLog = (line: string): WsAction => ({ type: 'APPEND_LOG', line });
export const setInput = (input: string): WsAction => ({ type: 'SET_INPUT', input });
export const setMembers = (members: string[]): WsAction => ({ type: 'SET_MEMBERS', members }) 