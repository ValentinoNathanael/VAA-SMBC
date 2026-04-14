import { getRole } from "@/lib/auth.server";
import DataManagementClient from "./DataManagementClient";

export default async function DataManagementPage() {
    const role = await getRole();
    return <DataManagementClient role={role} />;
}