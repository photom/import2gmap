export type ExtractionErrorCode =
  | 'NotSavedListPage'
  | 'ItemNameMissing'
  | 'ItemUrlMissing'
  | 'InvalidShopUrl'
  | 'AddressMissing'
  | 'BookmarksDataInvalid'
  | 'CollectionCatalogInvalid'
  | 'SelectorDrift'
  | 'IncompleteCrawl'
  | 'EmptyList'
  | 'SessionCorrupt';

export class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}
