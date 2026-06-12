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
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/95 to-primary/90 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Document Management
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              Configure dynamic pricing and availability for official university documents.
            </p>
          </div>
          
          <Button 
            className="rounded-full px-6 bg-white/20 hover:bg-white/30 text-white border-none shadow-sm backdrop-blur-md" 
            onClick={startNew} 
            disabled={editingId === "new"}
          >
            <Plus className="w-5 h-5 -ml-1 mr-2" /> Add New Document
          </Button>
        </div>
      </div>

      <Card className="shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 pb-6 px-8 pt-8">
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Available Documents</CardTitle>
          <CardDescription>Manage descriptions, pricing, and active status.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <TableHead className="pl-8 h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Document</TableHead>
                  <TableHead className="h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Description</TableHead>
                  <TableHead className="pl-2.5 h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Status</TableHead>
                  <TableHead className="text-right h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Price</TableHead>
                  <TableHead className="text-right pr-8 h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Action</TableHead>
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
                              onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
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
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-border/40 hover:bg-primary/5 group"
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
                              <FileText className="w-4 h-4 text-amber-600" />
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
                                    <div className={`w-2 h-2 rounded-full ${editForm.isActive === "true" ? "bg-primary" : "bg-amber-500"}`} />
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
                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                    Inactive
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            config.isActive ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-emerald-700 dark:text-primary">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-gold/10 dark:text-gold">
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
                                  onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
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
