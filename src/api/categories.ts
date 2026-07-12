import { apiRequestRaw } from './client';

/**
 * App-category labels (2d). The control-plane resolves coarse app/site tokens the Windows agent
 * could not classify locally — via a curated seed + Claude Haiku — and operators can correct any
 * of them here (an override always beats the LLM). See GET/PATCH /v1/categories.
 *
 * Note: this endpoint is not yet in the generated OpenAPI types, so we use the raw client.
 */

export type AppCategorySource = 'override' | 'curated' | 'llm' | 'pending';

/** The 8 categories, in lockstep with the agent's AppCategory enum. */
export const APP_CATEGORY_NAMES = [
  'Unknown',
  'Development',
  'Productivity',
  'Communication',
  'Entertainment',
  'SocialMedia',
  'Gaming',
  'GamingLauncher'
] as const;

export type AppCategoryName = (typeof APP_CATEGORY_NAMES)[number];

export interface AppCategoryLabel {
  token: string;
  category: AppCategoryName;
  source: AppCategorySource;
  modelVer: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CategoriesResponse {
  categories: AppCategoryLabel[];
  count: number;
}

/** Full listing, newest-updated first. */
export async function fetchCategories(signal?: AbortSignal): Promise<AppCategoryLabel[]> {
  const res = await apiRequestRaw<CategoriesResponse>({
    path: '/v1/categories',
    method: 'get',
    ...(signal === undefined ? {} : { signal })
  });
  return res?.categories ?? [];
}

/** Operator override — always wins over curated/llm. */
export async function setCategoryOverride(token: string, category: AppCategoryName): Promise<void> {
  await apiRequestRaw({
    path: `/v1/categories/${encodeURIComponent(token)}`,
    method: 'patch',
    body: { category }
  });
}
