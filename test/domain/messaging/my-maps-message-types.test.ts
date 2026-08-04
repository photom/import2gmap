import { describe, expect, it } from 'vitest';
import {
  isMapsToWorkerMessage,
  isWorkerToMapsMessage,
} from '../../../src/domain/messaging/message-types';

describe('isWorkerToMapsMessage', () => {
  it('accepts MAPS_PREPARE_IMPORT with a jobId', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_PREPARE_IMPORT', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(true);
  });

  it('accepts MAPS_OPEN_IMPORT_DIALOG with a jobId', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_OPEN_IMPORT_DIALOG', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(true);
  });

  it('accepts MAPS_FEED_KML with kml and fileName', () => {
    expect(
      isWorkerToMapsMessage({
        type: 'MAPS_FEED_KML',
        protocolVersion: 1,
        jobId: 'job-1',
        kml: '<kml></kml>',
        fileName: 'a.kml',
      }),
    ).toBe(true);
  });

  it('rejects MAPS_FEED_KML without kml', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_FEED_KML', protocolVersion: 1, jobId: 'job-1', fileName: 'a.kml' }),
    ).toBe(false);
  });

  it('accepts MAPS_AWAIT_IMPORT_RESULT with a jobId', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_AWAIT_IMPORT_RESULT', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(true);
  });

  it('accepts MAPS_SET_MAP_TITLE with a non-empty mapName', () => {
    expect(
      isWorkerToMapsMessage({
        type: 'MAPS_SET_MAP_TITLE',
        protocolVersion: 1,
        jobId: 'job-1',
        mapName: '食べログ保存リスト 2026-08-02',
      }),
    ).toBe(true);
  });

  it('rejects MAPS_SET_MAP_TITLE without mapName', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_SET_MAP_TITLE', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(false);
  });

  it('rejects MAPS_SET_MAP_TITLE with an empty mapName', () => {
    expect(
      isWorkerToMapsMessage({ type: 'MAPS_SET_MAP_TITLE', protocolVersion: 1, jobId: 'job-1', mapName: '' }),
    ).toBe(false);
  });

  it('rejects the retired MAPS_IMPORT_KML type (split into MAPS_OPEN_IMPORT_DIALOG / MAPS_FEED_KML / MAPS_AWAIT_IMPORT_RESULT)', () => {
    expect(
      isWorkerToMapsMessage({
        type: 'MAPS_IMPORT_KML',
        protocolVersion: 1,
        jobId: 'job-1',
        kml: '<kml></kml>',
        fileName: 'a.kml',
      }),
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(isWorkerToMapsMessage({ type: 'NOT_REAL', protocolVersion: 1, jobId: 'job-1' })).toBe(false);
  });
});

describe('isMapsToWorkerMessage', () => {
  it('accepts MAPS_PREPARE_RESULT ok:true', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_PREPARE_RESULT', protocolVersion: 1, jobId: 'job-1', ok: true }),
    ).toBe(true);
  });

  it('accepts MAPS_PREPARE_RESULT ok:false with a code', () => {
    expect(
      isMapsToWorkerMessage({
        type: 'MAPS_PREPARE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: false,
        code: 'MyMapsNotReady',
      }),
    ).toBe(true);
  });

  it('rejects MAPS_PREPARE_RESULT ok:false without a code', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_PREPARE_RESULT', protocolVersion: 1, jobId: 'job-1', ok: false }),
    ).toBe(false);
  });

  it('accepts MAPS_OPEN_IMPORT_DIALOG_RESULT ok:true', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_OPEN_IMPORT_DIALOG_RESULT', protocolVersion: 1, jobId: 'job-1', ok: true }),
    ).toBe(true);
  });

  it('accepts MAPS_OPEN_IMPORT_DIALOG_RESULT ok:false with a code', () => {
    expect(
      isMapsToWorkerMessage({
        type: 'MAPS_OPEN_IMPORT_DIALOG_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: false,
        code: 'MyMapsUiChanged',
      }),
    ).toBe(true);
  });

  it('accepts MAPS_FEED_KML_RESULT ok:true', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId: 'job-1', ok: true }),
    ).toBe(true);
  });

  it('accepts MAPS_FEED_KML_RESULT ok:true with an optional diagnostics array', () => {
    expect(
      isMapsToWorkerMessage({
        type: 'MAPS_FEED_KML_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        diagnostics: ['[import2gmap] job=job-1 step=feedKml:layout branch=upload_nav_already_selected'],
      }),
    ).toBe(true);
  });

  it('rejects MAPS_FEED_KML_RESULT ok:false without a code', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId: 'job-1', ok: false }),
    ).toBe(false);
  });

  it('accepts MAPS_IMPORT_RESULT ok:true', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_IMPORT_RESULT', protocolVersion: 1, jobId: 'job-1', ok: true }),
    ).toBe(true);
  });

  it('accepts MAPS_SET_MAP_TITLE_RESULT ok:true', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId: 'job-1', ok: true }),
    ).toBe(true);
  });

  it('accepts MAPS_SET_MAP_TITLE_RESULT ok:false with a code', () => {
    expect(
      isMapsToWorkerMessage({
        type: 'MAPS_SET_MAP_TITLE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: false,
        code: 'MyMapsUiChanged',
      }),
    ).toBe(true);
  });

  it('rejects MAPS_SET_MAP_TITLE_RESULT ok:false without a code', () => {
    expect(
      isMapsToWorkerMessage({ type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId: 'job-1', ok: false }),
    ).toBe(false);
  });

  it('accepts MAPS_UI_CHANGED with a code', () => {
    expect(
      isMapsToWorkerMessage({
        type: 'MAPS_UI_CHANGED',
        protocolVersion: 1,
        jobId: 'job-1',
        code: 'MyMapsUiChanged',
      }),
    ).toBe(true);
  });
});
