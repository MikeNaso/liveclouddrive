var fuse = require('node-fuse-bindings')
var onedrive=require('./onedrive-c')
const fs=require('fs')
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database('files.sqlite', (err)=>
{
  if (err) {
      console.error(err.message);
  } else {

    const sql="CREATE TABLE IF NOT EXISTS toupload( id INTEGER primary key,  path TEXT NOT NULL, tmpfile TEXT NOT NULL)";
    db.exec( sql );
    
    console.log('Connected to the database.');
  }
});

var mountPath = process.platform !== 'win32' ? './mnt' : 'M:\\'
 
_fileToUpload={size: 0, fileRef:null, buffer:[], tmpName:null}
// Load the tree
onedrive.ODInterface(onedrive.buildTreeDelta,
  {nextURI: "", extra: ""}, function(v){ 
    onedrive._lastChecked=new Date(); //.toISOString();
    startMount()
  } 
)

function startMount()
{
  _dir=onedrive._structure
  _waiting=false

  fuse.mount(mountPath, {
    // Force Umount
    force: true,
    readdir: async function (path, cb) {
      console.log('readdir(%s)', path)
      _dir=onedrive.findDir(path, onedrive._structure)
      
      var _files=[]
      for( var b in _dir.folders)
      {
        _files.push(_dir.folders[b]['name'])
      }
      for( var b in _dir.files)
      {
        _files.push(_dir.files[b]['name'])
      }
      // console.log(_files)
      return cb(0, _files)
    },
    getattr:  function (path, cb) {
      console.log('getattr(%s)', path)

      var _dt=new Date()
      if( (_dt.getTime()-onedrive._lastChecked.getTime())>15000 && !_waiting)
      {
        _waiting=true
        onedrive.ODInterface(onedrive.buildTreeDelta,
          {nextURI: "", extra: onedrive._lastChecked.toISOString()}, function(v){ 
            onedrive._lastChecked=new Date(); //.toISOString();
            _waiting=false
          } 
        )
      }
      var _dir=onedrive.findDir( path, onedrive._structure)
          
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
        cb(0, _dir.files[_file])
        return
      }
      else if( _file in _dir.folders)
      {
        cb(0, _dir.folders[_file])
        return
      }
      else if( _dir.name==_file )
      {
        console.log( "Folder "+_file)
        // console.log( _dir.folders[_file])
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
      console.log("Truncate")
      cb(0)
    },
    chmod: function(path, mode, cb)
    {
      console.log('CHMOD %s Mode %s', path, mode)
      cb(0)
    },
    create: function (path, flags, cb) {
      // created = true
      console.log('Create %s Flag %s', path, flags)
      var _dir=onedrive.findDir( path, onedrive._structure)
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
      var buf=Buffer.concat(_fileToUpload.buffer)
      _fileToUpload.fileRef.end()
      // To be refactored
      // await onedrive.msCreateSession(path, buf,function(expiration,nextExpectedRanges,uploadUrl){
      //     onedrive.msUploadBySession(uploadUrl, 0, buf.length,  buf.length, buf, function(d){ console.log(d); 
      //       _fileToUpload={size: 0, fileRef:null, buffer:[]}
      //     })
      //   })

      // Since we are going to use the file, 

      // console.log( path )
      if( _fileToUpload.startSaving==0){
        _fileToUpload.startSaving=1

        await onedrive.ODInterface(onedrive.msUploadFile, {path:path.substring(1), tpmName: 'cache/'+_fileToUpload.tmpName, size: _fileToUpload.size},function (msg) {
          console.log( done)
      } )}
      cb(0)
    },
    unlink: async function(path, cb) {
      console.log('Unlink '+path)
      _dir=onedrive.findDir(path, onedrive._structure)
      _file=path.split('/').pop()
      // msUnlink
      if( _file in _dir.files)
      {
        console.log( _dir.files[_file]['id'])
        await onedrive.msUnlink( _dir.files[_file]['id'], function(r){
          console.log(r)
        })
      }
      cb(0)
    },
    fsync: function(path, fd, datasync, cb)
    {
      console.log('Fsync')
      cb(0)
    },

    write: async function(path, fd, buf, len, pos, cb){
      console.log('writing %s Len %s Pos %s ', path, len, pos)

      if(pos==0)
      {
        console.log("Open Stream")
        let tmpName=((Math.random() + 1)*99999).toString(16).substring(4);
        const stmt = db.prepare("INSERT INTO toupload (path, tmpfile ) VALUES (?,?)");
        stmt.run(path, tmpName)
        stmt.finalize();

        var stream = await fs.createWriteStream(`cache/${tmpName}`);
        _fileToUpload.tmpName=tmpName
        _fileToUpload.fileRef=stream
        _fileToUpload.db = db
        _fileToUpload.startSaving=0
      }
      else {
        console.log(pos)
        _fileToUpload.fileRef.write(Buffer.from(buf))
        cb(len)
      }
      // console.log( Buffer.from(buf) )
      _fileToUpload.buffer.push(Buffer.from(buf))
      _fileToUpload.fileRef.on('open', async () => {
        _fileToUpload.fileRef.write(Buffer.from(buf))
        cb(len)
      });

      _fileToUpload.size+=len
      
    },
    read: async function (path, fd, buf, len, pos, cb) {
      console.log('read(%s, %d, %d, %d)', path, fd, len, pos)
      var _dir=onedrive.findDir( path, onedrive._structure)
      _file=path.split('/').pop()
      if( _file in _dir.files && 'new' in _dir.files[_file])
      {
        console.log("NEW FILE")
        cb(0)
        return
      }
      // var str = 'hello world\n'.slice(pos, pos + len)
      var _response=''
      var _link=''
      var _info=0
      await onedrive.msDownload(path,function(info, response){ 
        console.log( 'INFO ', info)
        _info=info
        if( info==200) {
          _link=response
        } 
      })
      if( _info!=200)
      {
        return cb(0)
      }
      if( _link!='')
      {
        await onedrive.msDownloadPartial(_link, pos+'-'+(len+pos)
        , function(info, response){
            console.log( response.length)
            console.log( '===========> Info '+info )
            if( info==200)
            {
              _response=response
            }
            else {
              return cb(0)
            }
        })
      }

      console.log( "Size "+_response.length)
      var part=_response.slice( pos, pos+len)
      part.copy(buf)
      return cb(part.length) //_response.length)
    }
  }, function (err) {
    if (err) throw err
    console.log('filesystem mounted on ' + mountPath)
  })
  
  process.on('SIGINT', function () {
    fuse.unmount(mountPath, function (err) {
      if (err) {
        console.log('filesystem at ' + mountPath + ' not unmounted', err)
      } else {
        console.log('filesystem at ' + mountPath + ' unmounted')
      }
    });
    db.close((err) => {
      if (err) {
          return console.error(err.message);
      }
      console.log('Close the database connection.');
  });

  })
}