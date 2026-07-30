export type CollectionRef = {
  readonly id: string;
  readonly name: string;
};

export type ExtractedShop = {
  readonly name: string;
  readonly url: string;
  readonly address: string;
  readonly description: string;
  readonly collections: readonly CollectionRef[];
};

export type ExtractedSavedList = {
  readonly shops: readonly ExtractedShop[];
  readonly collectionsCatalog: readonly CollectionRef[];
};
