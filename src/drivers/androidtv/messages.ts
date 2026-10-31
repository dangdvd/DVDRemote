// Android TV Remote Service v2 messages (polo.proto + remotemessage.proto field numbers).
import { ProtoMessage, ProtoWriter } from '../../core/protobuf';

export const PAIRING_PORT = 6467;
export const REMOTE_PORT = 6466;

// ---- Pairing (polo) ----
const STATUS_OK = 200;
const ENCODING_HEXADECIMAL = 3;
const ROLE_INPUT = 1;

export const Pairing = {
  PROTOCOL_VERSION: 1,
  STATUS: 2,
  PAIRING_REQUEST: 10,
  PAIRING_REQUEST_ACK: 11,
  OPTIONS: 20,
  CONFIGURATION: 30,
  CONFIGURATION_ACK: 31,
  SECRET: 40,
  SECRET_ACK: 41,
};

function outer(): ProtoWriter {
  return new ProtoWriter().uint(Pairing.PROTOCOL_VERSION, 2).uint(Pairing.STATUS, STATUS_OK);
}

function hexEncoding(): ProtoWriter {
  return new ProtoWriter().uint(1, ENCODING_HEXADECIMAL).uint(2, 6);
}

export function pairingRequest(clientName: string): Uint8Array {
  return outer()
    .message(Pairing.PAIRING_REQUEST, new ProtoWriter().string(1, 'atvremote').string(2, clientName))
    .finish();
}

export function pairingOptions(): Uint8Array {
  return outer()
    .message(Pairing.OPTIONS, new ProtoWriter().message(1, hexEncoding()).uint(3, ROLE_INPUT))
    .finish();
}

export function pairingConfiguration(): Uint8Array {
  return outer()
    .message(Pairing.CONFIGURATION, new ProtoWriter().message(1, hexEncoding()).uint(2, ROLE_INPUT))
    .finish();
}

export function pairingSecret(secret: Uint8Array): Uint8Array {
  return outer().message(Pairing.SECRET, new ProtoWriter().bytesField(1, secret)).finish();
}

export function pairingStatusOk(msg: ProtoMessage): boolean {
  return msg.uint(Pairing.STATUS) === STATUS_OK;
}

// ---- Remote ----
export const Remote = {
  CONFIGURE: 1,
  SET_ACTIVE: 2,
  ERROR: 3,
  PING_REQUEST: 8,
  PING_RESPONSE: 9,
  KEY_INJECT: 10,
  IME_KEY_INJECT: 20,
  IME_BATCH_EDIT: 21,
  START: 40,
  SET_VOLUME_LEVEL: 50,
  APP_LINK_LAUNCH: 90,
};

export enum Direction {
  START_LONG = 1,
  END_LONG = 2,
  SHORT = 3,
}

/** Feature bits announced in RemoteConfigure.code1. */
export const Feature = {
  PING: 1 << 0,
  KEY: 1 << 1,
  IME: 1 << 2,
  POWER: 1 << 5,
  VOLUME: 1 << 6,
  APP_LINK: 1 << 9,
};
export const CLIENT_FEATURES =
  Feature.PING | Feature.KEY | Feature.IME | Feature.POWER | Feature.VOLUME | Feature.APP_LINK;

export function remoteConfigure(features: number, model: string, vendor: string): Uint8Array {
  const deviceInfo = new ProtoWriter()
    .string(1, model)
    .string(2, vendor)
    .uint(3, 1)
    .string(4, '1')
    .string(5, 'atvremote')
    .string(6, '1.0.0');
  return new ProtoWriter()
    .message(Remote.CONFIGURE, new ProtoWriter().uint(1, features).message(2, deviceInfo))
    .finish();
}

export function remoteSetActive(features: number): Uint8Array {
  return new ProtoWriter().message(Remote.SET_ACTIVE, new ProtoWriter().uint(1, features)).finish();
}

export function remotePingResponse(val1: number): Uint8Array {
  return new ProtoWriter().message(Remote.PING_RESPONSE, new ProtoWriter().uint(1, val1)).finish();
}

export function remoteKeyInject(keyCode: number, direction: Direction = Direction.SHORT): Uint8Array {
  return new ProtoWriter()
    .message(Remote.KEY_INJECT, new ProtoWriter().uint(1, keyCode).uint(2, direction))
    .finish();
}

export function remoteAppLink(link: string): Uint8Array {
  return new ProtoWriter().message(Remote.APP_LINK_LAUNCH, new ProtoWriter().string(1, link)).finish();
}

export function remoteImeText(text: string, imeCounter: number, fieldCounter: number): Uint8Array {
  const pos = text.length - 1;
  const imeObject = new ProtoWriter().uint(1, pos).uint(2, pos).string(3, text);
  const editInfo = new ProtoWriter().uint(1, 1).message(2, imeObject);
  return new ProtoWriter()
    .message(
      Remote.IME_BATCH_EDIT,
      new ProtoWriter().uint(1, imeCounter).uint(2, fieldCounter).message(3, editInfo),
    )
    .finish();
}
