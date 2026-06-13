"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { User, Search, SearchX } from "lucide-react";
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

  // Filter
  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
    const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
    return name.includes(q) || email.includes(q);
  });

  // Paginate
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Student Directory
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              View all registered students, their request history, and lifetime value.
            </p>
          </div>
          
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/70" />
            <Input 
              placeholder="Search students by name or email..." 
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/70 shadow-inner rounded-full h-11 focus-visible:ring-white/30"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </div>

      <Card className="shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 pb-6 px-8 pt-8">
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Registered Students</CardTitle>
          <CardDescription>A complete list of students who have signed up via the portal.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <TableHead className="pl-8 w-[35%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Student</TableHead>
                  <TableHead className="w-[30%] h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Email Address</TableHead>
                  <TableHead className="w-[15%] text-right h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Total Requests</TableHead>
                  <TableHead className="w-[20%] text-right pr-8 h-12 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Lifetime Value</TableHead>
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
                          <SearchX className="w-8 h-8 text-muted-foreground/50 mb-2" />
                          <p>No students found matching your search.</p>
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
                      className="border-b border-border/40 hover:bg-primary/5 transition-colors group"
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
