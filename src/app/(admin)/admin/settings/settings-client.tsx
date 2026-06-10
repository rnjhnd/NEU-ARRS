"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { grantAdminRole } from "@/app/actions/admin.actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type UserType = { id: string; name: string; email: string; isAdmin: boolean };

export function SettingsClient({ users }: { users: UserType[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

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

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-indigo-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              System Settings
            </h1>
            <p className="text-indigo-100/90 text-lg font-medium max-w-xl">
              Manage system configuration, role assignments, and global application parameters.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-border md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Global system variables.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <p className="text-sm font-semibold mb-1">Email Templates</p>
              <p className="text-xs text-muted-foreground mb-3">Customize the automated emails sent to students when their document is ready.</p>
              <Button variant="outline" size="sm" className="w-full" disabled>Coming Soon</Button>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl border border-border">
              <p className="text-sm font-semibold mb-1">Payment Gateways</p>
              <p className="text-xs text-muted-foreground mb-3">Configure PayMongo API keys and active payment methods.</p>
              <Button variant="outline" size="sm" className="w-full" disabled>Coming Soon</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border md:col-span-2">
          <CardHeader className="border-b pb-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>Grant or revoke administrator privileges.</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search users..." 
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="pl-6 h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                  <TableHead className="h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Role</TableHead>
                  <TableHead className="text-right pr-6 h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredUsers.map((user) => (
                    <motion.tr 
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
