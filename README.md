# Live Cloud Drive
## Story behind this "crap" (I am not a developer, don't be scared)

**This is only a proof of concept**

I am planning to add OneDrive support in a project developed in nodejs, since I didn't and I don't know anything about nodejs, what will be the best way to learn some?
A couple of days ago I developed this app, in order to create a virtual file system using Fuse (using node fuse bindings) and I developed a graph authentication and OneDrive connected.


You need to create a dir mnt, cache and the files.db

At this moment it seems that it is able to read file, almost refined the save

This is the table in the files.sqlite

CREATE TABLE toupload(
        id INTEGER primary key,
        path TEXT NOT NULL,
        tmpfile TEXT NOT NULL
);

You should register an application in the Azure portal
This is the autorisations

- files.readwrite
- files.readwrite.all
- offline_access


**Please don't use in any production**