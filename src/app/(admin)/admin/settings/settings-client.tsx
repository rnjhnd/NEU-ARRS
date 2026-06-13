"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { grantAdminRole, updateSystemSetting } from "@/app/actions/admin.actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UserType = { id: string; name: string; email: string; isAdmin: boolean };

export function SettingsClient({ users, initialEmailTemplates }: { users: UserType[], initialEmailTemplates: Record<string, string> }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>(initialEmailTemplates);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("PENDING_PAYMENT");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const handleToggleRole = async (userId: string, currentIsAdmin: boolean) => {
    setIsUpdating(userId);
    const res = await grantAdminRole(userId, !currentIsAdmin);
    if (res.success) {
      toast.success(`Role updated successfully.`);
    } else {
      toast.error(res.error);
    }
    setIsUpdating(null);
  };

  const handleSaveEmailTemplates = async () => {
    setIsSavingEmail(true);
    const res = await updateSystemSetting("EMAIL_TEMPLATES", JSON.stringify(emailTemplates));
    if (res.success) {
      toast.success("Email templates updated successfully.");
      setIsEmailModalOpen(false);
    } else {
      toast.error(res.error);
    }
    setIsSavingEmail(false);
  };

  const statuses = [
    { id: "PENDING_PAYMENT", label: "Pending Payment" },
    { id: "PENDING", label: "Pending" },
    { id: "PROCESSING", label: "Processing" },
    { id: "READY_FOR_PICKUP", label: "Ready for Pickup" },
    { id: "COMPLETED", label: "Completed" },
    { id: "CANCELLED", label: "Cancelled" },
  ];

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              System Settings
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              Manage system configuration, role assignments, and global application parameters.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden md:col-span-1 h-fit">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <h2 className="text-xl font-bold tracking-tight">Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">Global system variables.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <p className="text-sm font-semibold mb-1">Email Templates</p>
              <p className="text-xs text-muted-foreground mb-3">Customize the automated emails sent to students when their document is ready.</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                onClick={() => setIsEmailModalOpen(true)}
              >
                Edit Templates
              </Button>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <p className="text-sm font-semibold mb-1">Payment Gateways</p>
              <p className="text-xs text-muted-foreground mb-3">Configure PayMongo API keys and active payment methods.</p>
              <Button variant="outline" size="sm" className="w-full" disabled>Coming Soon</Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden md:col-span-2">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Role Management</h2>
              <p className="text-sm text-muted-foreground mt-1">Grant or revoke administrator privileges.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search users..." 
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="p-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="pl-6 w-[40%] h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                  <TableHead className="w-[30%] h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Role</TableHead>
                  <TableHead className="text-right pr-6 w-[30%] h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredUsers.length === 0 && (
                    <motion.tr 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                    >
                      <TableCell colSpan={3} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <UserX className="h-8 w-8 mb-2 text-muted-foreground/60" />
                          <p>No users found matching your search.</p>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {filteredUsers.map((user) => (
                    <motion.tr 
                      key={user.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-border"
                    >
                      <TableCell className="pl-6">
                        <div className="flex flex-col">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.isAdmin ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                            Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-600">
                            Student
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {user.isAdmin ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            disabled={isUpdating === user.id}
                            onClick={() => handleToggleRole(user.id, true)}
                          >
                            <ShieldAlert className="w-4 h-4 mr-2" /> Revoke
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-primary hover:text-primary hover:bg-primary/10"
                            disabled={isUpdating === user.id}
                            onClick={() => handleToggleRole(user.id, false)}
                          >
                            <ShieldCheck className="w-4 h-4 mr-2" /> Grant Admin
                          </Button>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-border/50 shadow-2xl rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <DialogTitle className="text-2xl font-bold tracking-tight">Email Templates</DialogTitle>
            <DialogDescription>
              Customize the text inserted into automated emails sent to students for each request status.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[400px]">
            {/* Custom Tabs Sidebar */}
            <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-border/50 bg-muted/10 overflow-y-auto pt-3">
              {statuses.map((status) => (
                <button
                  key={status.id}
                  onClick={() => setActiveTab(status.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    activeTab === status.id 
                      ? 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary font-medium border-l-4 border-primary' 
                      : 'text-muted-foreground hover:bg-muted/50 border-l-4 border-transparent'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto">
              <h3 className="text-lg font-semibold mb-2">{statuses.find(s => s.id === activeTab)?.label} Email Text</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This message will be injected prominently in the status update email just below the greeting.
              </p>
              
              <textarea 
                className="flex flex-1 w-full rounded-xl border border-input bg-transparent px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[200px] resize-none"
                placeholder={`E.g., We have started processing your document. Please allow 3-5 business days...`}
                value={emailTemplates[activeTab] || ""}
                onChange={(e) => setEmailTemplates({ ...emailTemplates, [activeTab]: e.target.value })}
              />
            </div>
          </div>
          
          <DialogFooter className="m-0 p-6 border-t border-border/50 bg-muted/10 sm:justify-end items-center">
            <Button variant="outline" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEmailTemplates} disabled={isSavingEmail} className="bg-primary hover:bg-primary/90 text-white">
              {isSavingEmail ? "Saving..." : "Save Templates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
