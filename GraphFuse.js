var fuse = require('node-fuse-bindings')
var onedrive=require('./onedrive-c')
const fs=require('fs')
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database('files.db');

// const strs = require('stringstream')

var mountPath = process.platform !== 'win32' ? './mnt' : 'M:\\'
 
// var _structure={ '/': {'folders': []}}
// var _files=[]
_fileToUpload={size: 0, fileRef:null, buffer:[]}
onedrive.buildTreeDelta("","",function(v){ 
  onedrive._lastChecked=new Date(); //.toISOString();
} )
_dir=onedrive._structure
_waiting=false

// function findDir( path, _struct )
// {
//   _path=path.split('/')
//   _dir=_struct
//   for( var b in _path)
//   {
//     if(b==0)
//     {
//       continue
//     }
//     if( _path[b]!='' )
//     {
//       if(_path[b] in _dir.folders)
//       {
//         _dir=_dir.folders[_path[b]]
//       }
//     }
//   }
//   return _dir
// }
fuse.mount(mountPath, {
  force: true,
  readdir: async function (path, cb) {
    console.log('readdir(%s)', path)
    // _path=path.split('/')
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
      onedrive.buildTreeDelta("",onedrive._lastChecked.toISOString(),function(v){ 
        _waiting=false
      } )
      onedrive._lastChecked=new Date();
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
    // console.log( _dir )
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
    _fileToUpload={size: 0, fileRef:null, buffer:[]}
    created = true
    cb(0, 42)
  },
  setxattr: function(path, name, buffer, length, offset, flags, cb){
    console.log("SetXattr Path %s Name %s Len %s offset %s Flags %s",path, name, length, offset, flags)
    cb(0)
  },
  release: async function (path, fd, cb) {
    var buf=Buffer.concat(_fileToUpload.buffer)
    _fileToUpload.fileRef.end
    await onedrive.msCreateSession(path, buf,function(expiration,nextExpectedRanges,uploadUrl){
        onedrive.msUploadBySession(uploadUrl, 0, buf.length,  buf.length, buf, function(d){ console.log(d); 
          _fileToUpload={size: 0, fileRef:null, buffer:[]}
        })
      })
    // if(_fileToUpload.fileRef!=null)
    // {
    //   _fileToUpload[path].fileRef.end()
    //   // var stream = fs.createWriteStream("cache/my_file.txt");
    //   // _fileToUpload[path].fileRef=stream;
    // }
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
    console.log('writing %s ', path)

    if(_fileToUpload.buffer.length==0)
    {
      let tmpName=((Math.random() + 1)*99999).toString(16).substring(4);
      const stmt = db.prepare("INSERT INTO toupload (path, tmpfile ) VALUES (?,?)");
      stmt.run(path, tmpName)
      stmt.finalize();

      var stream = fs.createWriteStream(`cache/${tmpName}`);
      _fileToUpload.fileRef=stream
      _fileToUpload={size: 0, fileRef:stream, buffer:[]}
    }
    // else {
    _fileToUpload.buffer.push(Buffer.from(buf))
    _fileToUpload.fileRef.write(buf)

    _fileToUpload.size+=len
    // }
    // |_fileToUpload[path]={size: 0, fileRef:null}

    // onedrive.msCreateSession(path, buf,function(expiration,nextExpectedRanges,uploadUrl){
    //     // console.log("PRINT CC"+cc); 
    //     console.log('FFFFINE');
    //     console.log( buf);
    //     var tmp=buf.slice(0,len)
    //     // buf.copy(tmp)
    //     onedrive.msUploadBySession(uploadUrl, pos, len, tmp, function(d){ console.log(d); })
    //   })

    cb(len) // we handled all the data
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
  })
})