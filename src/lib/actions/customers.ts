"use server";

import { addEquipment, addSite, createCustomer, updateCustomer } from "@/lib/services/customers";
import { guarded, refreshAll, str } from "./util";

export async function createCustomerAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const businessName = str(fd, "businessName");
    if (!businessName && !str(fd, "primaryContact")) throw new Error("Add a business or contact name.");
    const c = await createCustomer({ businessName, primaryContact: str(fd, "primaryContact"), phone: str(fd, "phone"), email: str(fd, "email"), type: str(fd, "type"), notes: str(fd, "notes"), address: str(fd, "address"), siteName: str(fd, "siteName") }, user.name);
    refreshAll();
    return { message: "Customer created", customerId: c.id };
  });
}

export async function updateCustomerAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    await updateCustomer(str(fd, "customerId"), { businessName: str(fd, "businessName"), primaryContact: str(fd, "primaryContact"), phone: str(fd, "phone"), email: str(fd, "email"), type: str(fd, "type"), notes: str(fd, "notes") }, user.name);
    refreshAll();
    return { message: "Customer saved" };
  });
}

export async function addSiteAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    await addSite(str(fd, "customerId"), { name: str(fd, "name"), address: str(fd, "address") }, user.name);
    refreshAll();
    return { message: "Site added" };
  });
}

export async function addEquipmentAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    await addEquipment(str(fd, "siteId"), { type: str(fd, "type"), makeModel: str(fd, "makeModel"), notes: str(fd, "notes") }, user.name);
    refreshAll();
    return { message: "Equipment added" };
  });
}
