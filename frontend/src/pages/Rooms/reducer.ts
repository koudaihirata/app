import { type WsAction } from "./action"

export type State = {
    roomId: string,
    name: string,
    connected: boolean,
    joined: boolean,
    input: string,
    logs: string[]
    members: string[]
}

export const defaultState: State = {
    roomId: 'room-1',
    name: 'Kodai',
    connected: false,
    joined: false,
    input: '',
    logs: [],
    members: []
}

export function Reducer(state: State, action: WsAction): State {
    switch (action.type) {
        case 'SET_ROOM':
            if (state.connected) return state
            return {
                ...state, 
                roomId: action.roomId
            }
        case 'SET_NAME':
            if (state.connected) return state
            return {
                ...state,
                name: action.name
            }
        case 'CONNECTING':
            return {
                ...state,
                connected: false
            }
        case 'CONNECTED':
            return {
                ...state,
                connected: true
            }
        case 'DISCONNECTED':
            return {
                ...state,
                connected: false,
                joined: false
            }
        case 'JOINED':
            return {
                ...state,
                joined: true,
                roomId: action.roomId
            }
        case 'SET_INPUT':
            return {
                ...state,
                input: action.input
            }
        case 'APPEND_LOG':
            return {
                ...state,
                logs: [
                    ...state.logs,
                    action.line
                ]
            }
        case 'SET_MEMBERS':
            return {
                ...state,
                members: action.members
            }
    }
    throw new (class SystemException {})()
}