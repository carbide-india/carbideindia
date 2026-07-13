import { redirect } from "next/navigation";
import type { Route } from "next";

/**
 * The Enquiry Register now lives inside the Enquiries module shell at
 * `/enquiries/register`. This old standalone route redirects there so any
 * existing links keep working.
 */
export default function InquiriesIndexRedirect() {
  redirect("/enquiries/register" as Route);
}
