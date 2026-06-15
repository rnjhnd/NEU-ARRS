"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Edit2, Check, X, Loader2, Plus, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const sortedConfigs = [...configs].sort((a, b) => a.label.localeCompare(b.label));

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
      if (res.success && res.config) {
        toast.success("New document configuration created successfully.");
        setConfigs([...configs, res.config]);
        setEditingId(null);
      } else {
        toast.error(res.error || "Failed to create document.");
      }
    } else {
      const res = await updateDocumentConfig(formData);
      if (res.success) {
        toast.success("Document configuration updated successfully.");
        setConfigs(configs.map(c => c.id === id ? { 
          ...c, 
          label: editForm.label, 
          description: editForm.description, 
          price: parseFloat(editForm.price) * 100, 
          isActive: editForm.isActive === "true" 
        } : c));
        setEditingId(null);
      } else {
        toast.error(res.error || "Failed to update document configuration.");
      }
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <Card className="shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0 gap-0 !pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 py-6 px-8">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Available Documents</CardTitle>
            <CardDescription>Manage descriptions, pricing, and active status.</CardDescription>
          </div>
          <Button 
            size="sm" className="rounded-full px-6" 
            onClick={startNew} 
            disabled={editingId === "new"}
          >
            <Plus className="w-4 h-4 mr-2" /> Add New Document
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <TableHead className="pl-8 w-[25%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Document</TableHead>
                  <TableHead className="w-[35%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Description</TableHead>
                  <TableHead className="pl-2.5 w-[15%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Status</TableHead>
                  <TableHead className="text-right w-[15%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Price</TableHead>
                  <TableHead className="text-right pr-8 w-[10%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {editingId === "new" && (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border/40 bg-muted/20"
                    >
                      <TableCell className="pl-8 py-4">
                        <Input 
                          placeholder="Label (e.g. Report Card)"
                          value={editForm.label} 
                          onChange={(e) => setEditForm({...editForm, label: e.target.value})} 
                          className="h-9 w-48 bg-background border-border/50 rounded-lg"
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <Input 
                          placeholder="Description..."
                          value={editForm.description} 
                          onChange={(e) => setEditForm({...editForm, description: e.target.value})} 
                          className="h-9 w-64 bg-background border-border/50 rounded-lg"
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <Select value={editForm.isActive} onValueChange={(v) => setEditForm({...editForm, isActive: v || ""})}>
                          <SelectTrigger className="h-9 w-[130px] rounded-lg border-border/50 bg-background shadow-sm hover:bg-muted/50 transition-colors">
                            <SelectValue placeholder="Status">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${editForm.isActive === "true" ? "bg-primary" : "bg-gold"}`} />
                                {editForm.isActive === "true" ? "Active" : "Inactive"}
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false} className="border-border/40 shadow-lg backdrop-blur-xl bg-background/95 min-w-[130px] p-1">
                            <SelectItem value="true" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                Active
                              </div>
                            </SelectItem>
                            <SelectItem value="false" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-gold" />
                                Inactive
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div className="flex w-full justify-end">
                          <div className="relative w-28">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₱</span>
                            <Input 
                              type="number"
                              min="0"
                              value={editForm.price} 
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val.includes('-')) return;
                                setEditForm({...editForm, price: val});
                              }}
                              onKeyDown={(e) => {
                                if (e.key === '-' || e.key === 'e') e.preventDefault();
                              }}
                              className="h-9 pl-7 pr-3 bg-background border-border/50 rounded-lg text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-red-500/10 hover:text-red-500" onClick={() => setEditingId(null)} disabled={isSubmitting}>
                            <X className="w-4 h-4" />
                          </Button>
                          <Button variant="default" size="icon" className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-white" onClick={() => handleSave("new")} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {sortedConfigs.map((config) => {
                    const isEditing = editingId === config.id;
                    return (
                      <motion.tr 
                        key={config.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-b border-border/40 last:border-0 hover:bg-primary/5 group"
                      >
                        <TableCell className="pl-8 py-4">
                          {isEditing ? (
                            <Input 
                              value={editForm.label} 
                              onChange={(e) => setEditForm({...editForm, label: e.target.value})} 
                              className="h-9 w-48 bg-background border-border/50 rounded-lg"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-yellow-600 dark:text-gold" />
                              <span className="font-bold text-foreground">{config.label}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {isEditing ? (
                            <Input 
                              value={editForm.description} 
                              onChange={(e) => setEditForm({...editForm, description: e.target.value})} 
                              className="h-9 w-64 bg-background border-border/50 rounded-lg"
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">{config.description}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {isEditing ? (
                            <Select value={editForm.isActive} onValueChange={(v) => setEditForm({...editForm, isActive: v || ""})}>
                              <SelectTrigger className="h-9 w-[130px] rounded-lg border-border/50 bg-background shadow-sm hover:bg-muted/50 transition-colors">
                                <SelectValue placeholder="Status">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${editForm.isActive === "true" ? "bg-primary" : "bg-yellow-500 dark:bg-gold"}`} />
                                    {editForm.isActive === "true" ? "Active" : "Inactive"}
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false} className="border-border/40 shadow-lg backdrop-blur-xl bg-background/95 min-w-[130px] p-1">
                                <SelectItem value="true" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                    Active
                                  </div>
                                </SelectItem>
                                <SelectItem value="false" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-gold" />
                                    Inactive
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            config.isActive ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-emerald-700 dark:text-primary border border-primary/20 dark:border-primary/30">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-500/20 dark:border-gold/20">
                                Inactive
                              </span>
                            )
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          {isEditing ? (
                            <div className="flex w-full justify-end">
                              <div className="relative w-28">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₱</span>
                                <Input 
                                  type="number"
                                  min="0"
                                  value={editForm.price} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.includes('-')) return;
                                    setEditForm({...editForm, price: val});
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === '-' || e.key === 'e') e.preventDefault();
                                  }}
                                  className="h-9 pl-7 pr-3 bg-background border-border/50 rounded-lg text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="font-semibold text-foreground">
                              ₱{(config.price / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-8 py-4">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-red-500/10 hover:text-red-500" onClick={() => setEditingId(null)} disabled={isSubmitting}>
                                <X className="w-4 h-4" />
                              </Button>
                              <Button variant="default" size="icon" className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-white" onClick={() => handleSave(config.id)} disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => startEdit(config)}>
                              <Edit2 className="w-4 h-4" />
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
