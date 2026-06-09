"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Edit2, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { updateDocumentConfig, createDocumentConfig } from "@/app/actions/admin.actions";
import { DocumentConfig } from "@prisma/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export function DocumentClient({ initialConfigs }: { initialConfigs: DocumentConfig[] }) {
  const [configs, setConfigs] = useState<DocumentConfig[]>(initialConfigs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit State
  const [editForm, setEditForm] = useState({ typeId: "", label: "", description: "", price: "0", isActive: "true" });

  const startEdit = (config: DocumentConfig) => {
    setEditingId(config.id);
    setEditForm({
      typeId: config.typeId,
      label: config.label,
      description: config.description,
      price: (config.price / 100).toString(),
      isActive: config.isActive.toString()
    });
  };

  const startNew = () => {
    setEditingId("new");
    setEditForm({
      typeId: "",
      label: "",
      description: "",
      price: "0",
      isActive: "true"
    });
  };

  const handleSave = async (id: string) => {
    setIsSubmitting(true);
    const formData = new FormData();
    if (id !== "new") formData.append("id", id);
    formData.append("label", editForm.label);
    formData.append("description", editForm.description);
    formData.append("price", editForm.price);
    formData.append("isActive", editForm.isActive);

    if (id === "new") {
      const res = await createDocumentConfig(formData);
      if (res.success) {
        toast.success("New document created.");
        setConfigs([...configs, res.config]);
        setEditingId(null);
      } else {
        toast.error(res.error);
      }
    } else {
      const res = await updateDocumentConfig(formData);
      if (res.success) {
        toast.success("Document configuration updated.");
        setConfigs(configs.map(c => c.id === id ? { 
          ...c, 
          label: editForm.label, 
          description: editForm.description, 
          price: parseFloat(editForm.price) * 100, 
          isActive: editForm.isActive === "true" 
        } : c));
        setEditingId(null);
      } else {
        toast.error(res.error);
      }
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Document Management</h2>
          <p className="text-muted-foreground">Configure the documents available for student requests.</p>
        </div>
        <Button className="shadow-sm" onClick={startNew} disabled={editingId === "new"}>
          <FileText className="w-4 h-4 mr-2" /> Add New Document
        </Button>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/10 border-b border-border pb-6">
          <CardTitle className="text-xl">Available Documents</CardTitle>
          <CardDescription>Manage descriptions, pricing, and availability.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/30">
                  <TableHead className="pl-6 font-semibold">Document Name</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold">Price (₱)</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right pr-6 font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {editingId === "new" && (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border bg-muted/20"
                    >
                      <TableCell className="pl-6">
                        <Input 
                          placeholder="Label (e.g. Report Card)"
                          value={editForm.label} 
                          onChange={(e) => setEditForm({...editForm, label: e.target.value})} 
                          className="h-8 w-48"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          placeholder="Description..."
                          value={editForm.description} 
                          onChange={(e) => setEditForm({...editForm, description: e.target.value})} 
                          className="h-8 w-64"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number"
                          value={editForm.price} 
                          onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
                          className="h-8 w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <select 
                          className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                          value={editForm.isActive}
                          onChange={(e) => setEditForm({...editForm, isActive: e.target.value})}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={isSubmitting}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                          <Button variant="default" size="sm" onClick={() => handleSave("new")} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {configs.map((config) => {
                    const isEditing = editingId === config.id;
                    return (
                      <motion.tr 
                        key={config.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-border hover:bg-muted/40 transition-colors"
                      >
                        <TableCell className="pl-6">
                          {isEditing ? (
                            <Input 
                              value={editForm.label} 
                              onChange={(e) => setEditForm({...editForm, label: e.target.value})} 
                              className="h-8 w-48"
                            />
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{config.label}</span>
                              <span className="text-xs text-muted-foreground font-mono">{config.typeId}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input 
                              value={editForm.description} 
                              onChange={(e) => setEditForm({...editForm, description: e.target.value})} 
                              className="h-8 w-64"
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">{config.description}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input 
                              type="number"
                              value={editForm.price} 
                              onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
                              className="h-8 w-24"
                            />
                          ) : (
                            <span className="font-medium text-foreground">{(config.price / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <select 
                              className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                              value={editForm.isActive}
                              onChange={(e) => setEditForm({...editForm, isActive: e.target.value})}
                            >
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          ) : (
                            config.isActive ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">Inactive</span>
                            )
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={isSubmitting}>
                                <X className="w-4 h-4 text-red-500" />
                              </Button>
                              <Button variant="default" size="sm" onClick={() => handleSave(config.id)} disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => startEdit(config)}>
                              <Edit2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
