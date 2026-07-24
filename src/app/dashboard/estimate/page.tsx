import { redirect } from "next/navigation";

export default async function EstimatePage() {
  redirect("/dashboard/estimate/intake");
}
