import { handleApi } from '../../lib/api.js';

export function onRequest({ request }) {
  return handleApi(request);
}
