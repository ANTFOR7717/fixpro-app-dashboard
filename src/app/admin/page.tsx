import { redirect } from "next/navigation";
import { adminConfig } from "@/features/user-management/config/admin-config";

const AdminPage = async () => {
  redirect(adminConfig.defaultRoute);
};

export default AdminPage;
