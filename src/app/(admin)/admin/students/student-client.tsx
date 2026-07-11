"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { User, Search, SearchX, ArrowUp, ArrowDown, ArrowUpDown, Users, FileText, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import Image from "next/image";

export type SerializedUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: { emailAddress: string }[];
  imageUrl: string;
};

export function StudentClient({ 
  users, 
  countMap, 
  ltvMap 
}: { 
  users: SerializedUser[], 
  countMap: Record<string, number>,
  ltvMap: Record<string, number>
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const ITEMS_PER_PAGE = 10;
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>(null);

  // Filter
  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
    const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
    return name.includes(q) || email.includes(q);
  });

  // Sort
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!sortConfig) return 0;
    
    let aVal: any = "";
    let bVal: any = "";

    if (sortConfig.key === "name") {
      aVal = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
      bVal = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase();
    } else if (sortConfig.key === "email") {
      aVal = a.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
      bVal = b.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
    } else if (sortConfig.key === "count") {
      aVal = countMap[a.id] || 0;
      bVal = countMap[b.id] || 0;
    } else if (sortConfig.key === "ltv") {
      aVal = ltvMap[a.id] || 0;
      bVal = ltvMap[b.id] || 0;
    }

    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Paginate
  const totalPages = Math.ceil(sortedUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const SortableHeader = ({ title, sortKey, alignRight = false, className = "" }: { title: string, sortKey: string, alignRight?: boolean, className?: string }) => {
    if (filteredUsers.length <= 1) {
      return (
        <TableHead className={`font-semibold tracking-wider text-muted-foreground uppercase text-xs h-12 ${alignRight ? "text-right" : ""} ${className}`}>
          {title}
        </TableHead>
      );
    }

    const isActive = sortConfig?.key === sortKey;
    
    const renderIcon = () => {
      if (isActive) {
        return sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
      }
      return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />;
    };

    return (
      <TableHead className={`font-semibold tracking-wider text-foreground uppercase text-xs h-12 ${alignRight ? "text-right" : ""} ${className}`}>
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1.5 hover:text-primary transition-colors py-2 group ${alignRight ? "ml-auto justify-end" : ""}`}
        >
          {alignRight && renderIcon()}
          {title}
          {!alignRight && renderIcon()}
        </button>
      </TableHead>
    );
  };

  // Metrics calculation
  const totalStudents = users.length;
  const totalRequests = Object.values(countMap).reduce((acc, curr) => acc + curr, 0);
  const totalRevenue = Object.values(ltvMap).reduce((acc, curr) => acc + curr, 0);

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-2xl shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Total Students</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground">{totalStudents}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 rounded-2xl shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Total Requests</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground">{totalRequests}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Lifetime Revenue</p>
              <h3 className="text-3xl font-bold tracking-tight text-primary">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Student Directory</CardTitle>
            <CardDescription>A complete list of students who have signed up via the portal.</CardDescription>
          </div>
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
            <Input 
              placeholder="Search students by name or email..." 
              className="pl-10 bg-background/40 hover:bg-background/80 focus:bg-background backdrop-blur-sm border-border/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-none rounded-full h-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <SortableHeader title="Student" sortKey="name" className="pl-8 w-[35%]" />
                  <SortableHeader title="Email Address" sortKey="email" className="w-[30%]" />
                  <SortableHeader title="Total Requests" sortKey="count" alignRight className="w-[15%]" />
                  <SortableHeader title="Lifetime Value" sortKey="ltv" alignRight className="pr-8 w-[20%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {paginatedUsers.length === 0 && (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          {users.length === 0 ? (
                            <>
                              <Users className="w-8 h-8 text-muted-foreground/50 mb-2" />
                              <p>No students are currently registered in the system.</p>
                            </>
                          ) : (
                            <>
                              <SearchX className="w-8 h-8 text-muted-foreground/50 mb-2" />
                              <p>No students found matching your search.</p>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                {paginatedUsers.map((user) => {
                  const email = user.emailAddresses?.[0]?.emailAddress || "No email";
                  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unnamed User";
                  const reqCount = countMap[user.id] || 0;
                  const ltv = ltvMap[user.id] || 0;
                  
                  return (
                    <motion.tr 
                      key={user.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-border/40 last:border-0 hover:bg-primary/5 transition-colors group"
                    >
                      <TableCell className="pl-8 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20 group-hover:border-primary/40 transition-colors overflow-hidden">
                            {user.imageUrl ? (
                              <img src={user.imageUrl} alt={name} className="h-full w-full object-cover" />
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </div>
                          <span className="font-semibold text-foreground truncate">
                            {name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground py-4">
                        {email}
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <span className="font-medium text-foreground">
                          {reqCount} {reqCount === 1 ? 'Request' : 'Requests'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-4">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          ₱{ltv.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                    </motion.tr>
                  );
                })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {/* Pagination Footer */}
        {totalPages > 1 && (
          <CardFooter className="flex items-center justify-between border-t border-border/50 px-8 py-4 bg-muted/5">
            <span className="text-sm font-medium text-muted-foreground">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length} students
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full border-border/50 hover:bg-background"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="text-sm font-semibold text-foreground px-2">
                Page {currentPage} of {totalPages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full border-border/50 hover:bg-background"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
