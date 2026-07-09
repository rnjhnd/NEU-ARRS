"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, UserX, SearchX, Loader2, Mail, AlertTriangle, CreditCard, MapPin, Clock, CheckCircle2, Package, Activity, Filter, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { updateUserRole, updateSystemSetting } from "@/app/actions/admin.actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type UserType = { id: string; name: string; email: string; role: string };

export function SettingsClient({ 
  users, 
  initialEmailTemplates,
  initialMaintenanceMode,
  initialPaymentMethods,
  initialOperationsConfig
}: { 
  users: UserType[], 
  initialEmailTemplates: Record<string, string>,
  initialMaintenanceMode: boolean,
  initialPaymentMethods: { online: boolean, cash: boolean },
  initialOperationsConfig: { location: string, hours: string }
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>(initialEmailTemplates);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("PENDING_PAYMENT");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // New states
  const [maintenanceMode, setMaintenanceMode] = useState(initialMaintenanceMode);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const [isOpsModalOpen, setIsOpsModalOpen] = useState(false);
  const [opsConfig, setOpsConfig] = useState(initialOperationsConfig);
  const [isSavingOps, setIsSavingOps] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("pending");
  const [localUsers, setLocalUsers] = useState<UserType[]>(users);
  const [currentPage, setCurrentPage] = useState(1);

  // Sync with server if props update
  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  // Pagination and Filtering logic
  const itemsPerPage = 7;
  
  const filteredUsers = localUsers.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  const handleUpdateRole = async (userId: string, newRole: "admin" | "employee" | "student") => {
    const originalUser = localUsers.find(u => u.id === userId);
    if (!originalUser || originalUser.role === newRole) return;

    // Optimistic update
    setLocalUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    
    const res = await updateUserRole(userId, newRole);
    if (res.success) {
      toast.success(`Role successfully updated to ${newRole}.`);
    } else {
      toast.error(res.error || "Failed to update role");
      // Revert if failed
      setLocalUsers(prev => prev.map(u => u.id === userId ? { ...u, role: originalUser.role } : u));
    }
  };

  const handleSaveEmailTemplates = async () => {
    setIsSavingEmail(true);
    const res = await updateSystemSetting("EMAIL_TEMPLATES", JSON.stringify(emailTemplates));
    if (res.success) {
      toast.success("Email templates have been updated successfully.");
      setIsEmailModalOpen(false);
    } else {
      toast.error(res.error || "Failed to update email templates.");
    }
    setIsSavingEmail(false);
  };

  const handleToggleMaintenance = async () => {
    setIsSavingMaintenance(true);
    const newValue = !maintenanceMode;
    // Optimistic update
    setMaintenanceMode(newValue);
    setIsMaintenanceModalOpen(false); // Close dialog instantly

    const res = await updateSystemSetting("MAINTENANCE_MODE", String(newValue));
    if (res.success) {
      toast.success(`Maintenance mode ${newValue ? "enabled" : "disabled"}.`);
    } else {
      // Revert if failed
      setMaintenanceMode(!newValue);
      toast.error(res.error || "Failed to update maintenance mode.");
    }
    setIsSavingMaintenance(false);
  };

  const handleSavePaymentMethods = async () => {
    setIsSavingPayment(true);
    const res = await updateSystemSetting("PAYMENT_METHODS", JSON.stringify(paymentMethods));
    if (res.success) {
      toast.success("Payment methods updated successfully.");
      setIsPaymentModalOpen(false);
    } else {
      toast.error(res.error || "Failed to update payment methods.");
    }
    setIsSavingPayment(false);
  };

  const handleSaveOpsConfig = async () => {
    setIsSavingOps(true);
    const res = await updateSystemSetting("OPERATIONS_CONFIG", JSON.stringify(opsConfig));
    if (res.success) {
      toast.success("Operations configuration updated successfully.");
      setIsOpsModalOpen(false);
    } else {
      toast.error(res.error || "Failed to update operations configuration.");
    }
    setIsSavingOps(false);
  };

  const statuses = [
    { id: "PENDING_PAYMENT", label: "Pending Payment", icon: Clock, color: "text-yellow-600 dark:text-yellow-500" },
    { id: "PROCESSING", label: "Processing", icon: Activity, color: "text-yellow-600 dark:text-yellow-500" },
    { id: "READY_FOR_PICKUP", label: "Ready for Pickup", icon: Package, color: "text-primary" },
    { id: "COMPLETED", label: "Completed", icon: CheckCircle2, color: "text-primary" },
  ];

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden lg:col-span-1 h-fit">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <h2 className="text-xl font-bold tracking-tight">System Controls</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage core application behaviors and student experience.</p>
          </div>
          <div className="p-6 space-y-4">
            {/* Email Templates */}
            <div className="p-4 bg-muted/50 rounded-xl border border-border flex items-start gap-4">
              <div className="p-3 bg-primary/10 text-primary rounded-xl shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">Email Templates</p>
                <p className="text-xs text-muted-foreground mb-3">Customize the automated emails sent to students.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                  onClick={() => setIsEmailModalOpen(true)}
                >
                  Edit Templates
                </Button>
              </div>
            </div>
            
            {/* Maintenance Mode */}
            <div className={`p-4 rounded-xl border transition-colors flex items-start gap-4 ${maintenanceMode ? 'bg-red-500/10 border-red-500/30' : 'bg-muted/50 border-border'}`}>
              <div className={`p-3 rounded-xl shrink-0 ${maintenanceMode ? 'bg-red-500/20 text-red-600' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <p className={`text-sm font-semibold ${maintenanceMode ? 'text-red-700 dark:text-red-400' : ''}`}>Maintenance Mode</p>
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${maintenanceMode ? 'bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                    {maintenanceMode ? 'Active' : 'Disabled'}
                  </div>
                </div>
                <p className={`text-xs mb-3 ${maintenanceMode ? 'text-red-600/80 dark:text-red-400/80' : 'text-muted-foreground'}`}>Halt the system and prevent new requests.</p>
                <div className="flex items-center gap-3">
                  <Switch 
                    checked={maintenanceMode} 
                    onCheckedChange={() => {
                      if (!maintenanceMode) {
                        setIsMaintenanceModalOpen(true);
                      } else {
                        handleToggleMaintenance(); // Disable directly without modal
                      }
                    }} 
                    disabled={isSavingMaintenance}
                    className={maintenanceMode ? 'data-[state=checked]:bg-red-600' : ''}
                  />
                  <span className="text-xs font-medium">
                    {maintenanceMode ? "Turn Off" : "Turn On"}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Gateways */}
            <div className="p-4 bg-muted/50 rounded-xl border border-border flex items-start gap-4">
              <div className="p-3 bg-primary/10 text-primary rounded-xl shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">Payment Gateways</p>
                <p className="text-xs text-muted-foreground mb-3">Configure active payment methods.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                  onClick={() => setIsPaymentModalOpen(true)}
                >
                  Configure Payments
                </Button>
              </div>
            </div>

            {/* Operations Details */}
            <div className="p-4 bg-muted/50 rounded-xl border border-border flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-xl shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">Operations Details</p>
                <p className="text-xs text-muted-foreground mb-3">Set campus pickup location and hours.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                  onClick={() => setIsOpsModalOpen(true)}
                >
                  Edit Operations
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden lg:col-span-2 h-fit">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Role Management</h2>
              <p className="text-sm text-muted-foreground mt-1">Grant or revoke administrator privileges.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64 group">
                <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                <Input 
                  placeholder="Search users..." 
                  className="pl-10 bg-background/40 hover:bg-background/80 focus:bg-background backdrop-blur-sm border-border/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-none rounded-full h-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={(val: string | null) => setRoleFilter(val || "all")}>
                <SelectTrigger className="h-10 w-full sm:w-[130px] rounded-full border-border/50 bg-background/40 hover:bg-background/80 focus:bg-background transition-all">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Filter className="w-4 h-4" />
                    <SelectValue placeholder="Filter" />
                  </div>
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl border-border/40 shadow-lg backdrop-blur-xl bg-background/95">
                  <SelectItem value="all" className="rounded-lg my-0.5 font-medium">All Roles</SelectItem>
                  <SelectItem value="admin" className="rounded-lg my-0.5 font-medium">Administrators</SelectItem>
                  <SelectItem value="employee" className="rounded-lg my-0.5 font-medium">Employees</SelectItem>
                  <SelectItem value="student" className="rounded-lg my-0.5 font-medium">Students</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="pl-6 w-[60%] h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                  <TableHead className="w-[40%] h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredUsers.length === 0 && (
                    <motion.tr 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                    >
                      <TableCell colSpan={2} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          {users.length === 0 ? (
                            <>
                              <UserX className="h-8 w-8 mb-2 text-muted-foreground/60" />
                              <p>No users are currently registered in the system.</p>
                            </>
                          ) : (
                            <>
                              <SearchX className="h-8 w-8 mb-2 text-muted-foreground/60" />
                              <p>No users found matching your filters.</p>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {paginatedUsers.map((user) => (
                    <motion.tr 
                      key={user.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-border/50"
                    >
                      <TableCell className="pl-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Select 
                          value={user.role} 
                          onValueChange={(val: string | null) => {
                            if (val && (val === "admin" || val === "employee" || val === "student")) {
                              handleUpdateRole(user.id, val);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className="h-9 w-[150px] rounded-lg border-border/50 bg-background shadow-sm hover:bg-muted/50 transition-colors"
                          >
                            <SelectValue placeholder="Select role">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${user.role === "admin" ? "bg-primary" : user.role === "employee" ? "bg-slate-500 dark:bg-slate-400" : "bg-yellow-600 dark:bg-yellow-500"}`} />
                                <span className="font-medium text-foreground">{user.role === "admin" ? "Administrator" : user.role === "employee" ? "Employee" : "Student"}</span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false} className="border-border/40 shadow-lg backdrop-blur-xl bg-background/95 min-w-[150px] p-1">
                            <SelectItem value="admin" className="cursor-pointer focus:bg-primary/10 transition-colors py-2 rounded-md">
                              <div className="flex items-center gap-2 font-medium">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                Administrator
                              </div>
                            </SelectItem>
                            <SelectItem value="employee" className="cursor-pointer focus:bg-slate-500/10 transition-colors py-2 rounded-md">
                              <div className="flex items-center gap-2 font-medium">
                                <div className="w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
                                Employee
                              </div>
                            </SelectItem>
                            <SelectItem value="student" className="cursor-pointer focus:bg-yellow-500/10 transition-colors py-2 rounded-md">
                              <div className="flex items-center gap-2 font-medium">
                                <div className="w-2 h-2 rounded-full bg-yellow-600 dark:bg-yellow-500" />
                                Student
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-border/50 bg-muted/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of <span className="font-medium text-foreground">{filteredUsers.length}</span> users
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs rounded-full"
                    disabled={currentPage === 1} 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs rounded-full"
                    disabled={currentPage === totalPages || totalPages === 0} 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Maintenance Mode Alert Dialog */}
      <Dialog open={isMaintenanceModalOpen} onOpenChange={setIsMaintenanceModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-background border-border/50 shadow-2xl rounded-2xl">
          <DialogHeader className="pt-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-500" />
            </div>
            <DialogTitle className="text-xl text-center font-bold tracking-tight text-foreground">Enable Maintenance Mode?</DialogTitle>
            <DialogDescription className="text-center pt-2">
              This will completely lock out all students and prevent any new document requests from being created. 
              Only administrators and employees will have access to the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-3 sm:gap-4 flex-col sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto rounded-full" onClick={() => setIsMaintenanceModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="w-full sm:w-auto rounded-full" 
              onClick={handleToggleMaintenance} 
            >
              Yes, Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-border/50 shadow-2xl rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <DialogTitle className="text-2xl font-bold tracking-tight">Email Templates</DialogTitle>
            <DialogDescription>
              Customize the text inserted into automated emails sent to students for each request status.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[400px]">
            {/* Custom Tabs Sidebar */}
            <div className="w-full md:w-[220px] shrink-0 border-b md:border-b-0 md:border-r border-border/50 bg-muted/10 overflow-y-auto pt-3">
              {statuses.map((status) => {
                const Icon = status.icon;
                return (
                  <button
                    key={status.id}
                    onClick={() => setActiveTab(status.id)}
                    className={`w-full flex items-center gap-3 text-left px-4 py-3 text-sm transition-all duration-200 ${
                      activeTab === status.id 
                        ? 'bg-background text-foreground font-semibold border-l-4 border-primary shadow-sm' 
                        : 'text-muted-foreground hover:bg-muted/50 border-l-4 border-transparent hover:text-foreground'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${activeTab === status.id ? status.color : 'opacity-70'}`} />
                    {status.label}
                  </button>
                )
              })}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-background/50">
              <div className="flex items-center gap-3 mb-2">
                {(() => {
                  const currentStatus = statuses.find(s => s.id === activeTab);
                  const Icon = currentStatus?.icon || Mail;
                  return (
                    <>
                      <div className={`p-2 rounded-lg bg-muted`}>
                        <Icon className={`w-5 h-5 ${currentStatus?.color}`} />
                      </div>
                      <h3 className="text-lg font-semibold">{currentStatus?.label} Email Text</h3>
                    </>
                  );
                })()}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                This message will be injected prominently in the status update email just below the greeting.
              </p>
              
              <textarea 
                className="flex flex-1 w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 min-h-[200px] resize-none shadow-inner transition-all"
                placeholder={`E.g., We have started processing your document. Please allow 3-5 business days...`}
                value={emailTemplates[activeTab] || ""}
                onChange={(e) => setEmailTemplates({ ...emailTemplates, [activeTab]: e.target.value })}
              />
            </div>
          </div>
          
          <DialogFooter className="m-0 p-4 border-t border-border/50 bg-muted/10 sm:justify-end items-center">
            <Button variant="ghost" className="rounded-full" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEmailTemplates} disabled={isSavingEmail} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
              {isSavingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isSavingEmail ? "Saving..." : "Save Templates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-background border-border/50 shadow-2xl rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <DialogTitle className="text-2xl font-bold tracking-tight">Payment Gateways</DialogTitle>
            <DialogDescription>
              Toggle which payment methods are available to students.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${paymentMethods.online ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/50'}`}>
              <div>
                <p className={`font-semibold ${paymentMethods.online ? 'text-primary' : 'text-foreground'}`}>Online Payment (PayMongo)</p>
                <p className="text-sm text-muted-foreground mt-0.5">GCash, Maya, QR Ph, Cards.</p>
              </div>
              <Switch 
                checked={paymentMethods.online} 
                onCheckedChange={(checked) => {
                  if (!checked && !paymentMethods.cash) {
                    toast.error("You must have at least one active payment method.");
                    return;
                  }
                  setPaymentMethods({ ...paymentMethods, online: checked });
                }}
              />
            </div>
            <div className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${paymentMethods.cash ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/50'}`}>
              <div>
                <p className={`font-semibold ${paymentMethods.cash ? 'text-primary' : 'text-foreground'}`}>Cash on Pickup</p>
                <p className="text-sm text-muted-foreground mt-0.5">Pay at the registrar counter.</p>
              </div>
              <Switch 
                checked={paymentMethods.cash} 
                onCheckedChange={(checked) => {
                  if (!checked && !paymentMethods.online) {
                    toast.error("You must have at least one active payment method.");
                    return;
                  }
                  setPaymentMethods({ ...paymentMethods, cash: checked });
                }}
              />
            </div>
          </div>
          <DialogFooter className="m-0 p-4 border-t border-border/50 bg-muted/10 sm:justify-end items-center">
            <Button variant="ghost" className="rounded-full" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePaymentMethods} disabled={isSavingPayment} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
              {isSavingPayment ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isSavingPayment ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpsModalOpen} onOpenChange={setIsOpsModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-background border-border/50 shadow-2xl rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <DialogTitle className="text-2xl font-bold tracking-tight">Operations Details</DialogTitle>
            <DialogDescription>
              Update the campus pickup location and active business hours.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Pickup Location
              </label>
              <Input 
                value={opsConfig.location}
                onChange={(e) => setOpsConfig({ ...opsConfig, location: e.target.value })}
                placeholder="E.g., Registrar's Office at Window 4"
                className="h-10 border-border/50 bg-muted/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Business Hours
              </label>
              <Input 
                value={opsConfig.hours}
                onChange={(e) => setOpsConfig({ ...opsConfig, hours: e.target.value })}
                placeholder="E.g., 8:00 AM to 5:00 PM (Monday-Friday)"
                className="h-10 border-border/50 bg-muted/20"
              />
            </div>
          </div>
          <DialogFooter className="m-0 p-4 border-t border-border/50 bg-muted/10 sm:justify-end items-center">
            <Button variant="ghost" className="rounded-full" onClick={() => setIsOpsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveOpsConfig} disabled={isSavingOps} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6">
              {isSavingOps ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isSavingOps ? "Saving..." : "Save Details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
