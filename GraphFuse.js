var fuse = require('node-fuse-bindings')
var onedrive=require('./onedrive-c')
const fs=require('fs')
const sqlite3 = require('sqlite3')
const getConfig = require("./config.js");
require('console-stamp')(console, 'HH:MM:ss.l');

let db = new sqlite3.Database("livedrivecloud.db");
db.run("CREATE TABLE IF NOT EXISTS toupload( path TEXT NOT NULL primary key, tmpfile TEXT NOT NULL, superseeded INT DEFAULT 0)")

_fileToUpload={}

onedrive.ODInterface(onedrive.buildTreeDelta,
  {nextURI: "", extra: ""}, function(v){ 
    onedrive._lastChecked=new Date(); 
    startMount()
  } 
)

function refreshTree(cb)
{
  console.log("Refresh Tree")
  onedrive.ODInterface(onedrive.buildTreeDelta,
    {nextURI: "", extra: onedrive._lastChecked.toISOString()}, (err)=>{ 
      onedrive._lastChecked=new Date(); 
      cb(0)
    } 
  )
}
function startMount()
{
  _dir=onedrive._structure
  _waiting=false
  db.all( "SELECT * FROM toupload",[],(err,rows)=>{
    if( err) console.log( err);
    else{
      rows.forEach( (row)=>{
        //id,path, tmpfile
        console.log( row );
        var stats=fs.statSync(row.tmpfile)
        onedrive.ODInterface(onedrive.msUploadFile, {path:row.path.substring(1), tpmName: row.tmpfile, size: stats.size} ,function (msg) {
          console.log( "Msg Uploaded",msg)
          db.run('DELETE FROM toupload WHERE path=?',[row.path], function(err) {
            if( err)
              console.log("Cannot delete ", err.message)
            else {
              fs.unlink(row.tmpfile,(err=>{
                if( err) console.log( err)
                else {
                  _fileToUpload={}
                }
              }))
            }
          })
        })
      })
    }
  })
  fuse.mount(getConfig.mountPath, {
    // Force Umount
    force: true,
    readdir: async function (path, cb) {
      console.log('readdir(%s)', path)
      // console.l
      _dir=onedrive.findDir(path, onedrive._structure, true)
      console.log( _dir )
      var _files=[]
      for( var b in _dir.folders)
        _files.push(_dir.folders[b]['name'])
      
      for( var b in _dir.files)
        _files.push(_dir.files[b]['name'])
      
      return cb(0, _files)
    },
    getattr:  function (path, cb) {
      console.log('getattr(%s)', path)

      var _dt=new Date()
      if( (_dt.getTime()-onedrive._lastChecked.getTime())>15000 && !_waiting)
      {
        _waiting=true
        refreshTree((msg)=>{
        
        })
      }
      var _dir=onedrive.findDir( path, onedrive._structure, true)
        // console.log( _dir )
      var _file=path.split('/').pop()
      if (path === '/') {
        cb(0, {
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          nlink: 1,
          size: 100,
          mode: 16877,
          uid: process.getuid ? process.getuid() : 0,
          gid: process.getgid ? process.getgid() : 0
        })
        return
      }
      else if( _file in _dir.files)
      { 
        cb(null, _dir.files[_file])
        return
      }
      else if( _file in _dir.folders)
      {
        // console.log("Is a Folder")
        // console.log( _dir.folders[_file])
        cb(0, _dir.folders[_file])
        return
      }
      else if( _dir.name==_file )
      {
        cb(0, _dir)
        return
      }

      cb(fuse.ENOENT)
    },
    open: function (path, flags, cb) {
      // 1 Write, 2 Read, 3 W/R
      console.log('open(%s, %d)', path, flags)
      cb(0, 42) // 42 is an fd
    },
    truncate: function (path, size, cb) {
      console.log("Truncate ",path, size)
      var _dir=onedrive.findDir( path, onedrive._structure, true)
      var _file=path.split('/').pop()
      if (_file in _dir.files)
        _dir.files[_file].size=0

      // SET THE FILE TO 0 SIZE or remove it to decide
      cb(0)
    },
    chmod: function(path, mode, cb)
    {
      console.log('Chmod %s Mode %s', path, mode)
      cb(0)
    },
    create: function (path, flags, cb) {
      // created = true
      console.log('Create %s Flag %s', path, flags)
      var _dir=onedrive.findDir( path, onedrive._structure, true)
      if( flags=33188)
      {
        var _name=path.split('/').pop()
        console.log( _name )
        _dir.files[_name]={
          name: _name,
          new: 1,
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          nlink: 1,
          size: 0,
          mode: 33188,
          uid: process.getuid ? process.getuid() : 0,
          gid: process.getgid ? process.getgid() : 0
        }
      }
      _fileToUpload={size: 0, fileRef:null, buffer:[], tmpName:null, db: null}
      created = true
      cb(0, 42)
    },
    setxattr: function(path, name, buffer, length, offset, flags, cb){
      console.log("SetXattr Path %s Name %s Len %s offset %s Flags %s",path, name, length, offset, flags)
      cb(0)
    },
    release: async function (path, fd, cb) {
      console.log( "Release ",path)
      // Called agter read or write finish
      // var buf=Buffer.concat(_fileToUpload.buffer)
      if(  'fileRef' in _fileToUpload )
      {

        _fileToUpload.fileRef.end()

        if( "startSaving" in _fileToUpload && _fileToUpload.startSaving==0){
          _fileToUpload.startSaving=1
          console.log("Saving on cloud ")
          await onedrive.ODInterface(onedrive.msUploadFile, {path:path.substring(1), tpmName: _fileToUpload.tmpName, size: _fileToUpload.size} ,function (msg) {
            console.log( "Msg Uploaded",msg);
            refreshTree( (msg) => {});
            db.run('DELETE FROM toupload WHERE path=?',[path], function(err) {
              if( err)
                console.log("Cannot delete ", err.message)
              else {
                console.log("Unlink ",_fileToUpload.tmpName)
                fs.unlink(_fileToUpload.tmpName,(err=>{
                  if( err) console.log( err);
                  else 
                    _fileToUpload={}
                }))
              }
            }) 
            // remove for the db and delete tmp file
        } )}
      }
      cb(0)
    },
    unlink: async function(path, cb) {
      console.log('Unlink '+path)
      _dir=onedrive.findDir(path, onedrive._structure, true)
      _file=path.split('/').pop()
      if( _file in _dir.files)
      {
        console.log( _dir.files[_file]['id'])
        onedrive.ODInterface(onedrive.msUnlink, {itemId: _dir.files[_file]['id'] } , (info, response) =>{
          console.log(r)
          delete _dir.files[_file]
          refreshTree( (msg) => {})
          cb(0)
        })
      }
      
    },
    fsync: function(path, fd, datasync, cb)
    {
      console.log('Fsync', path, datasync)
      _dir=onedrive.findDir(path, onedrive._structure,true)
      _file=path.split('/').pop()
      // msUnlink
      if( _file in _dir.files)
      {
        _dir.files[_file].mtime= new Date();
      }

      cb(0)
    },
    rename: function(src, dest, cb){
      console.log("Rename %s => %s",src,dest)
      cb(0)
    },
    write: async function(path, fd, buf, len, pos, cb){
      console.log('writing %s Len %s Pos %s ', path, len, pos)

      if(pos==0)
      {
        console.log("Open Stream")
        let tmpName=getConfig.cacheDir+((Math.random() + 1)*99999).toString(16).substring(4);
        
        // You should check if there is a previous path, if it is the case remove it

        let stmt=db.run("INSERT INTO toupload (path, tmpfile ) VALUES (?,?)",[path, tmpName], function(err){
          if(err) {
            console.log("Cannot save ", err.message)
          }
        })

        var stream = await fs.createWriteStream(`${tmpName}`);
        _fileToUpload.tmpName=tmpName
        _fileToUpload.fileRef=stream
        // _fileToUpload.db = db
        _fileToUpload.startSaving=0
      }
      else {
        // console.log(pos)
        _fileToUpload.fileRef.write(Buffer.from(buf))
        console.log("Confirm",len)
        cb(len)
      }

      _fileToUpload.fileRef.on('open', async () => {
        _fileToUpload.fileRef.write(Buffer.from(buf))
        console.log("Confirm",len)
        cb(len)
      });
      _fileToUpload.size+=len
      console.log("END Write")
    },
    read: async function (path, fd, buf, len, pos, cb) {
      console.log('read(%s Pos %d Len %d)', path, pos,len)
      var _dir=onedrive.findDir( path, onedrive._structure, true)
      _file=path.split('/').pop()
      if( _file in _dir.files && 'new' in _dir.files[_file])
      {
        console.log("NEW FILE")
        cb(0)
        return
      }
      var _response=''
      var _link=''
      var _info=0

      await onedrive.ODInterface(onedrive.msDownload, {path:path} ,function (info, response) {
        console.log( 'INFO ', info)
        _info=info
        if( info==200 && response!='')
        {
          var _pos=pos+'-'+(len+pos-1)
          console.log( _pos)
          onedrive.ODInterface(onedrive.msDownloadPartial, {uri:response, range: _pos } ,function (info, response) {

                if( info==200)
                {
                  var part=response.slice( 0, len)
                  part.copy(buf)
                  return cb(part.length)
                }
                else 
                  return cb(0);
            })
        }
  
        // console.log('AB')
      });
    }
  }, function (err) {
    if (err) throw err
    console.log('filesystem mounted on ' + getConfig.mountPath);
  })
  
  process.on('SIGINT', function () {
    db.close((err) => {
      if (err) 
          return console.error(err.message);
      console.log('Close the database connection.');
    });
    fuse.unmount(getConfig.mountPath, function (err) {
      if (err) {
        console.log('filesystem at ' + getConfig.mountPath + ' not unmounted', err)
      } else {
        console.log('filesystem at ' + getConfig.mountPath + ' unmounted')
      }
    });
  })
}