import { lessons } from "../lib/education";
import { robotsPolicy } from "../lib/seo";
export default function robots() {
  return robotsPolicy(lessons.length > 0);
}
