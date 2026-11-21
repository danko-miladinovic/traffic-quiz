import "server-only";
import { adConfiguration } from "./ad-policy";
export const configuredAds = () => adConfiguration(process.env);
