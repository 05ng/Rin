import { createClient } from "../api/client";
import { endpoint, oauth_url, google_oauth_url } from "../config";

export { endpoint, oauth_url, google_oauth_url };

export const client = createClient(endpoint);
