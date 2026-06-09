"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Image from "next/image";

export type SerializedUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: { emailAddress: string }[];
  imageUrl: string;
  publicMetadata: Record<string, unknown>;
};

export function StudentClient({ users, countMap }: { users: SerializedUser[], countMap: Record<string, number> }) {
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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Student Directory</h2>
          <p className="text-muted-foreground">View all registered students and their request history.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-9 bg-card border-border shadow-sm rounded-full"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/10 border-b border-border pb-6">
          <CardTitle className="text-xl">Registered Users</CardTitle>
          <CardDescription>A complete list of users who have signed up via the portal.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/30">
                  <TableHead className="pl-6 w-[50px]"></TableHead>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Email Address</TableHead>
                  <TableHead className="font-semibold">Role</TableHead>
                  <TableHead className="text-right pr-6 font-semibold">Total Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No students found matching your search.
                    </TableCell>
                  </TableRow>
                )}
                {paginatedUsers.map((user) => {
                  const isAdmin = user.publicMetadata?.role === "admin";
                  const email = user.emailAddresses?.[0]?.emailAddress || "No email";
                  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unnamed User";
                  const reqCount = countMap[user.id] || 0;
                  
                  return (
                    <TableRow key={user.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                      <TableCell className="pl-6">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          {user.imageUrl ? (
                            <Image src={user.imageUrl} alt={name} width={32} height={32} className="h-8 w-8 rounded-full" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{email}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                            Student
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6 font-medium text-foreground">
                        {reqCount}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-muted/10">
              <span className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length} users
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium px-2">
                  Page {currentPage} of {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
