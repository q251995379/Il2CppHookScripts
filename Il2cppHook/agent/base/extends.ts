import { PassType } from "../utils/common"
import { formartClass as FM } from "../utils/formart"

export { }

declare global {
    var protect: (mPtr: NativePointer) => void
    var watch: (mPtr: NativePointer, length?: number) => void
    var watchDisabled: () => void
    var patchTest: (mPtr: NativePointer, size?: number) => void
    var findInMemory: (typeStr: "Dex" | "Dex1" | "PNG" | "global-metadata.dat" | string, scanSync?: boolean) => void
    var fridaInfo: () => void
    var listThreads: (maxCountThreads?: number) => void

    var currentThreadName: () => string

    var listModules: (filterName?: string) => void
    var listModule: (moduleName: string, printItems?: number) => void

    var b_export: (moduleName: string, exportName?: string) => void

    /**
     * findExport 侧重点在定位一些我们只知道函数名不知道他在那个模块里面（用于定位导出函数）
     * 故exportName作为第一个参数，第二个参数用作筛选
     */
    var findExport: (exportName: string, moduleName?: string, callback?: (exp: ModuleExportDetails) => void) => void
    /**
     * findImport 侧重点在像IDA一样方便的查看指定Module的导入函数
     * 故ModuleName作为第一个参数，第二个参数用作筛选
     */
    var findImport: (moduleName: string, importName?: string) => void

    /**
     * Stalker Trace Event (单独关键点追踪)
     */
    var StalkerTraceEvent: (mPtr: NativePointer, range: NativePointer[] | undefined) => void
    /**
     * Stalker Trace Path (配合IDA标注程序执行路线)
     */
    var StalkerTracePath: (mPtr: NativePointer, range: NativePointer[] | undefined) => void

    var cmdouleTest: () => void
    var sqliteTest: () => void
    var testBreak: () => void
}

/**
 *  b_export("Load", "libcocos2djs.so")
 */
let cacheMethods = new Map<string, number>()
globalThis.b_export = (moduleName: string, exportName?: string, passAddress?: number[]) => {
    findExport(moduleName, exportName, (exp: ModuleExportDetails) => {
        if (exp.type != "function") return
        if (passAddress == undefined) {
            innerAttach(exp)
        } else {
            if (!passAddress!.includes(exp.address.toInt32())) {
                innerAttach(exp)
            }
        }
    })

    function innerAttach(exp: ModuleExportDetails) {
        try {
            let lis: InvocationListener = Interceptor.attach(exp.address, {
                onEnter: function (args) {
                    cacheMethods.get(exp.name) ? cacheMethods.set(exp.name, cacheMethods.get(exp.name)! + 1) : cacheMethods.set(exp.name, 1)
                    if (cacheMethods.get(exp.name)! > 10) lis.detach()
                    LOGD(`Called : ${exp.name} @ ${exp.address} \nargs : ${args[0]} ${args[1]} ${args[2]} ${args[3]}`)
                }
            })
            LOGD(`Hooked : ${exp.name} @ ${exp.address} | ${exp.address.sub(Process.findModuleByAddress(exp.address)!.base)}`)
        } catch (e) {
            LOGE(`Hooked : ${exp.name} @ ${exp.address} | ${exp.address.sub(Process.findModuleByAddress(exp.address)!.base)}\n${e}`)
        }
    }
}

globalThis.protect = (mPtr: NativePointer, size: number = 0x1000, protection: PageProtection = "rwx") => {
    mPtr = checkPointer(mPtr).shr(3 * 4).shl(3 * 4)
    Memory.protect(mPtr, size, protection)
}

/**
 * frida API 实现的内存断点的封装
 * @param {NativePointer} mPtr 断点地址 
 * @param {number} length 长度
 */
globalThis.watch = (mPtr: NativePointer, length: number = 0x10) => {

    class MenRange implements MemoryAccessRange {
        base: NativePointer
        size: number
        constructor(base: NativePointer, size: number) {
            this.base = checkPointer(base)
            this.size = size
        }
    }

    class MemoryDetails implements MemoryAccessDetails {
        operation: MemoryOperation      // operation: 触发这次访问的操作类型, 仅限于 read, write, execute
        from: NativePointer             // from: NativePointer 类型的触发这次访问的指令的地址
        address: NativePointer          // address: NativePointer 类型的被访问的地址
        rangeIndex: number              // rangeIndex: 被访问的内存范围的索引
        pageIndex: number               // pageIndex: 被访问的页的索引
        pagesCompleted: number          // pagesCompleted: 到目前为止已访问(并且不再受监控)的内存页总数
        pagesTotal: number              // pagesTotal: 被访问的内存范围的总页数
        private mdFrom: Module
        private mdAddress: Module

        constructor(detail: MemoryAccessDetails) {
            this.operation = detail.operation
            this.from = detail.from
            this.address = detail.address
            this.rangeIndex = detail.rangeIndex
            this.pageIndex = detail.pageIndex
            this.pagesCompleted = detail.pagesCompleted
            this.pagesTotal = detail.pagesTotal
            this.mdAddress = Process.findModuleByAddress(this.address)!
            this.mdFrom = Process.findModuleByAddress(this.from)!
        }

        public tostring(): string {
            return `
operation:\t\t${this.operation}
from:\t\t\t${this.from} { ${this.from.sub(this.mdFrom.base)} @ ${this.mdFrom.name} }
address:\t\t${this.address} { ${this.address.sub(this.mdAddress.base)} @ ${this.mdAddress.name} }
rangeIndex:\t\t${this.rangeIndex}
pageIndex:\t\t${this.pageIndex}
pagesCompleted:\t\t${this.pagesCompleted}
pagesTotal:\t\t${this.pagesTotal}`
        }
    }

    // 监控一个或多个内存范围的访问情况, 并且在每个内存页第一次访问时触发回调函数 (onAccess)
    MemoryAccessMonitor.enable(new MenRange(mPtr, length), {
        // tips：如果同时对一个地址attach和watch则运行到该点时会崩溃 使用watch时注意先detach掉这个点的hook
        onAccess: (access: MemoryAccessDetails) => LOGD(new MemoryDetails(access).tostring())
    })
}

globalThis.watchDisabled = () => MemoryAccessMonitor.disable()

globalThis.sqliteTest = () => {
    var db, smt, row, name, bio;
    db = SqliteDatabase.open('/path/to/people.db');
    smt = db.prepare('SELECT name, bio FROM people WHERE age = ?');
    console.log('People whose age is 42:');
    smt.bindInteger(1, 42);
    while ((row = smt.step()) !== null) {
        name = row[0];
        bio = row[1];
        console.log('Name:', name);
        console.log('Bio:', bio);
    }
    smt.reset()
}

globalThis.findInMemory = (pattern: "Dex" | "Dex1" | "PNG" | "global-metadata.dat" | string, scanSync: boolean = false) => {
    switch (pattern) {
        case "Dex1":
            find("54 61 70 20 54 6F 20 53 74 61 72 74", (pattern, address, size) => {
                LOG('Found "DEX ' + pattern + " Address: " + address.toString() + "\n", LogColor.C36)
            })
            break
        case "Dex":
            find("64 65 78 0a 30 33 35 00", (pattern, address, size) => {
                // TODO
                LOG('Found "DEX"' + pattern + " Address: " + address.toString() + "\n", LogColor.C36)
            })
            break
        case "PNG":
            Process.enumerateRanges("r--").forEach((item) => {
                new Promise((onFound) => {
                    Memory.scan(item.base, item.size, "89 50 4E 47 0D 0A 1A 0A", {
                        onMatch: function (addressStart) {
                            onFound(addressStart)
                        },
                        onComplete: function () { }
                    })
                }).then(addressStart => {
                    // 同步方式效率太低
                    // let tmpResult = Memory.scanSync(ptr(addressStart), 8 * 1024, "00 00 00 00 49 45 4E 44 AE 42 60 82") 
                    new Promise((onFound) => {
                        Memory.scan(item.base, item.size, "00 00 00 00 49 45 4E 44 AE 42 60 82", {
                            onMatch: function (addressEnd) {
                                onFound(addressEnd)
                                return "stop"
                            },
                            onComplete: function () { }
                        })
                    }).then(value => {
                        return [addressStart, value]
                    }).then((result) => {
                        let tRes = result as NativePointer[]
                        let off = tRes[1].sub(tRes[0])
                        result[3] = off
                        LOG("\n" + getLine(60) + "\n[*] Found PNG From " + result[0] + " To " + result[1] + "  size : " + off + "(" + off.toInt32() + ")", LogColor.C36)
                        // arm 是小端模式 所以这里是字节顺序是大端 （Object下拓展了一个函数用来倒序 toInt32Big）
                        let x = toInt32Big(tRes[0].add(p_size * 4).readPointer()).toInt32()
                        let y = toInt32Big(tRes[0].add(p_size * 5).readPointer()).toInt32()
                        let dep = tRes[0].add(p_size * 6).readU8()
                        let type = tRes[0].add(p_size * 6 + 1).readU8()
                        let sig = toInt32Big(tRes[0].add(p_size * 7 + 1).readPointer())
                        LOG("\t (" + x + " X " + y + ") \t" + dep + " " + type + "\t" + sig, LogColor.C36)
                        return tRes
                    }).then(result => {
                        let tRes = result as NativePointer[]
                        let length = tRes[3].add(12).toInt32()
                        if (length <= 0) return
                        Memory.protect(tRes[0], 0xFFFF, "rwx")
                        let path = "/data/data/" + getPkgName() + "/" + result[0] + "_" + result[1] + ".png"
                        let file = new File(path, "wb")
                        let bytes = result[0].readByteArray(length)
                        if (length != 0 && bytes != null) file.write(bytes)
                        file.flush()
                        file.close()
                        LOGD('\tSave to\t\t===>\t' + path)
                    }).catch(err => {
                        LOGE(err)
                    })
                })
            })
            break
        case "global-metadata.dat":
            find("AF 1B B1 FA 18", (pattern, address, size) => {
                LOGE("\n" + getLine(80))
                LOGD('Found "global-metadata.dat"' + pattern + " Address: " + address.toString() + "\n")
                seeHexA(address, 64, true, LogColor.C33)

                let DefinitionsOffset = parseInt(address.toString(), 16) + 0x108;
                let DefinitionsOffset_size = ptr(DefinitionsOffset).readInt()

                let DefinitionsCount = parseInt(address.toString(), 16) + 0x10C;
                let DefinitionsCount_size = ptr(DefinitionsCount).readInt()

                // 根据两个偏移得出global-metadata大小
                let global_metadata_size = DefinitionsOffset_size + DefinitionsCount_size
                LOGD("\nFile size\t===>\t" + global_metadata_size + "B (" + (global_metadata_size / 1024 / 1024).toFixed(2) + "MB)")
                // 只保留大于两兆的文件
                if (global_metadata_size > 1024 * 1024 * 2) {
                    let path = "/data/data/" + getPkgName() + "/global-metadata.dat"
                    let file = new File(path, "wb")
                    let bytes = address.readByteArray(global_metadata_size)
                    if (global_metadata_size != 0 && bytes != null) file.write(bytes)
                    file.flush()
                    file.close()
                    LOGD('Save to\t\t===>\t' + path)
                }
                LOGD(getLine(80))
            })
            break
        default:
            var md = Process.findModuleByName("libil2cpp.so")
            if (md == null) {
                LOGE("NOT FOUND Module : libil2cpp.so")
                break
            } else {
                LOGW(JSON.stringify(m) + "\n")
            }
            if (scanSync) {
                var results = Memory.scanSync(md.base, md.size, pattern)
                LOGD("onMatch result = \n" + JSON.stringify(results))
            } else {
                Memory.scan(md.base, md.size, pattern, {
                    onMatch: function (address, size) {
                        LOGD("[*] Found at " + address + " with size " + size)
                        return 'stop'
                    },
                    onComplete: function () {
                        LOGE("onComplete");
                    }
                })
            }
            break
    }

    function toInt32Big(mPtr: NativePointer | number) {
        var resultStr = ''
        var aimStr = String(mPtr).split("0x")[1]
        for (let i = aimStr.length - 1; i >= 0; i--)
            resultStr += aimStr.charAt(i)
        return ptr("0x" + resultStr)
    }

    function find(pattern: string, callback: (pattern: string, address: NativePointer, size: number) => void) {
        LOG("Start Find Pattern '" + pattern + "'\nWatting ......", LogColor.C96)
        // 代码都是位于只读段
        let addrArray = Process.enumerateRanges("r--");
        addrArray.forEach((item) => {
            Memory.scan(item.base, item.size, pattern, {
                onMatch: function (address, size) {
                    callback(pattern, address, size)
                },
                onComplete: function () { }
            })
        })
    }

    function getPkgName() {
        let retStr = ""
        Java.perform(() => retStr = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext().getPackageName())
        return retStr
    }
}

globalThis.fridaInfo = () => {
    LOGD(`\n${getLine(40)}`)
    LOGD(`[*] Runtime : ${Script.runtime}`)
    LOGD(`[*] ThreadId : ${Process.getCurrentThreadId()}`)
    LOGD(`[*] Process.id : ${Process.id}`)
    LOGD(`[*] Process.arch : ${Process.arch}`)
    LOGD(`[*] Process.platform : ${Process.platform}`)
    LOGD(`[*] Process.pointerSize : ${Process.pointerSize}`)
    LOGD(`[*] Process.pageSize : ${Process.pageSize}`)
    LOGD(`[*] Process.codeSigningPolicy : ${Process.codeSigningPolicy}`)
    LOGD(`[*] Process.isDebuggerAttached : ${Process.isDebuggerAttached()}`)
    LOGD(`${getLine(40)}\n`)
}

function getThreadName(tid: number) {
    let threadName: string = "unknown"
    try {
        var file = new File("/proc/self/task/" + tid + "/comm", "r")
        threadName = file.readLine().toString().trimEnd()
        file.close()
    } catch (e) {
        console.error("Error getting thread name:", e)
        throw e
    }

    // var threadNamePtr: NativePointer = Memory.alloc(0x40)
    // var tid_p: NativePointer = Memory.alloc(p_size).writePointer(ptr(tid))
    // var pthread_getname_np = new NativeFunction(Module.findExportByName("libc.so", 'pthread_getname_np')!, 'int', ['pointer', 'pointer', 'int'])
    // pthread_getname_np(ptr(tid), threadNamePtr, 0x40)
    // threadName = threadNamePtr.readCString()!

    return threadName
}

globalThis.currentThreadName = (): string => {
    let tid = Process.getCurrentThreadId()
    return getThreadName(tid).toString()
}

let index_threads: number
globalThis.listThreads = (maxCountThreads: number = 20) => {
    index_threads = 0
    let current = Process.getCurrentThreadId()
    Process.enumerateThreads()
        .sort((a, b) => b.id - a.id)
        .slice(0, maxCountThreads)
        .forEach((thread: ThreadDetails) => {
            let indexText = FM.alignStr(`[${++index_threads}]`, 6)
            let text = `${indexText} ${thread.id} ${thread.state} | ${getThreadName(thread.id)}`
            let ctx = thread.context
            current == thread.id ? LOGE(text) : LOGD(text)
            LOGZ(`\tPC : ${ctx.pc}  ${checkCtx(ctx, "PC")}`)
            LOGZ(`\tLR : ${getPlatformCtx(ctx).lr}  ${checkCtx(ctx, "LR")}`)
        })
}

let index: number
globalThis.listModules = (filterName: string = "") => {
    index = 0
    Process.enumerateModules().forEach((md: Module) => {
        if (md.name.includes(filterName)) printModule(md, true)
    })
}

globalThis.listModule = (moduleName: string, printItems: number = 5) => {

    let md = Process.getModuleByName(moduleName)
    if (md == null) {
        LOGE("NOT FOUND Module : " + moduleName)
        return
    }
    printModule(md, false)
    if (moduleName == "linker") return

    let protection: PageProtection = "" // all , r , w , x
    let range = md.enumerateRanges(protection)
    if (range.length > 0) {
        LOGO(`\t[-] enumerateRanges ( ${range.length} )`)
        range.sort((f: RangeDetails, s: RangeDetails) => f.base.compare(s.base))
            .forEach((item: RangeDetails) => {
                LOGZ(`\t\t${item.protection}\t${item.base} - ${item.base.add(item.size)} | ${FM.alignStr(String(ptr(item.size)), p_size + 8)} <- ${item.size}`)
            })
        newLine()
    }

    let imp = md.enumerateImports()
    if (imp.length > 0) {
        LOGO(`\t[-] enumerateImports ( ${imp.length} )`)
        let arrTmpRecord: Array<string> = []
        imp.sort((a: ModuleImportDetails, b: ModuleImportDetails) => a.name.length - b.name.length)
            .slice(0, printItems).forEach((item: ModuleImportDetails) => {
                let address = FM.alignStr(String(item.address), p_size + 8)
                let importFromDes: string = "\t<---\t"
                try {
                    let tmd = Process.findModuleByAddress(item.address!)! //this can throw exception
                    let baseStr = ` @ ${tmd.base}`
                    if (item.type == "function" || item.type == "variable") // not undefined
                        importFromDes += `${tmd.name} ${arrTmpRecord.includes(tmd.name) ? FM.centerStr("...", baseStr.length) : baseStr}` //show base once
                    arrTmpRecord.push(tmd.name)
                } catch { importFromDes = "" }
                LOGZ(`\t\t${item.type}   ${address}  ${item.name} ${importFromDes}`)
            })
        if (imp.length > printItems) LOGZ("\t\t......\n")
    }

    let exp = md.enumerateExports()
    if (exp.length > 0) {
        LOGO(`\t[-] enumerateExports ( ${exp.length} )`)
        exp.sort((a: ModuleExportDetails, b: ModuleExportDetails) => a.name.length - b.name.length)
            .slice(0, printItems).forEach((item: ModuleExportDetails) => {
                let address = FM.alignStr(String(item.address), p_size + 8)
                LOGZ(`\t\t${item.type}   ${address}  ${item.name}`)
            })
        if (exp.length > printItems) LOGZ("\t\t......\n")
    }

    let sym = md.enumerateSymbols()
    if (sym.length > 0) {
        LOGO(`\t[-] enumerateSymbols ( ${sym.length} )`)
        sym.slice(0, printItems).forEach((item: ModuleSymbolDetails) => {
            LOGZ(`\t\t${item.isGlobal}  ${item.type}  ${item.name}  ${item.address}`)
        })
        if (sym.length > printItems) LOGZ("\t\t......\n")
    }
}

// 局部函数 打印模块信息
function printModule(md: Module, needIndex: boolean = false) {
    needIndex == true ? LOGD(`\n[${++index}]\t${md.name}`) : LOGD(`\n[*]\t${md.name}`)
    // 保留三位小数
    let fileLen = getFileLenth(md.path)
    let size = Math.round(md.size / 1024 / 1024 * 100) / 100
    let fileLenFormat = Math.round(fileLen / 1024 / 1024 * 100) / 100
    let extendFileLen = fileLen == 0 ? "" : `| FILE: ${fileLen} B ≈ ${fileLenFormat} MB `
    LOGZ(`\t${md.base} - ${(md.base.add(md.size))}  | MEM: ${ptr(md.size)} ( ${md.size} B = ${md.size / 1024} KB ≈ ${size} MB ) ${extendFileLen}`)
    LOGZ(`\t${md.path}\n`)
}

globalThis.findExport = (exportName: string, moduleName?: string, callback?: (exp: ModuleExportDetails, demangleName?: string) => void, checkDemangleName: boolean = false) => {
    if (callback == undefined) callback = showDetails
    var count = 0
    if (moduleName == undefined) {
        Process.enumerateModules().forEach((md: Module) => {
            md.enumerateExports().forEach((exp: ModuleExportDetails) => checkAndShow(exp, callback))
        })
    } else {
        let md: Module | null = Process.findModuleByName(moduleName)
        if (md == null) throw new Error("NOT FOUND Module : " + moduleName)
        md.enumerateExports().forEach((exp: ModuleExportDetails) => checkAndShow(exp, callback))
    }

    if (callback == showDetails) LOGN(`\n[=] ${count} result(s)\n`)
    else return

    function checkAndShow(exp: ModuleExportDetails, callback?: (exp: ModuleExportDetails, demangleName?: string) => void) {
        let name = exp.name
        if (checkDemangleName) {
            // 这会遍历太多的函数名 并且调用 demangle 会消耗大量时间，不建议使用
            let demangledName = demangleName(name)
            demangledName = (demangledName == "" ? name : demangledName)!
            if (name.indexOf(exportName) != -1 || demangledName.indexOf(exportName) != -1) callback!(exp, demangledName)
        } else {
            if (name.indexOf(exportName) != -1) {
                let demangledName = demangleName(name)
                demangledName = (demangledName == "" ? name : demangledName)!
                callback!(exp, demangledName)
            }
        }
    }

    function showDetails(exp: ModuleExportDetails, demangleName?: string) {
        try {
            let md: Module = Process.findModuleByAddress(exp.address)!
            if (md == null) {
                let mdt = Process.findModuleByName("linker")!
                mdt.enumerateExports().forEach((linkerExp: ModuleExportDetails) => {
                    if (linkerExp.address.equals(exp.address) && linkerExp.name == exp.name) md = mdt
                })
            }
            let rg: RangeDetails = Process.findRangeByAddress(exp.address)!
            let dmn = demangleName!
            let desp_first_line = `\n[*] ${exp.type} -> address: ${exp.address} ( ${exp.address.sub(md.base)} )  ${exp.name}`
            let desp_first_line_len = desp_first_line.length
            LOGD(desp_first_line)
            let paddedDmn = dmn.padStart(desp_first_line_len - exp.name.length + dmn.length - 1, " ")
            if (dmn.length != 0) LOGO(`${paddedDmn}`)
            LOGZ(`\t[-] MD_Base: ${md.base} | size: ${ptr(md.size).toString().padEnd(p_size * 2, " ")} <-  module:  ${md.name}`)
            LOGZ(`\t[-] RG_Base: ${rg.base} | size: ${ptr(rg.size).toString().padEnd(p_size * 2, " ")} <-  range:   ${rg.protection}`)
            ++count
        } catch (error) {
            if (Process.findModuleByAddress(exp.address) == null) LOGE("Module not found")
            if (Process.findRangeByAddress(exp.address) == null) LOGE("Range not found")
            LOGD(JSON.stringify(exp))
        }
    }
}

/**
 * Demangles a C++ symbol name using available libraries.
 * @param expName The mangled symbol name to demangle.
 * @returns The demangled symbol name, or an empty string if demangling failed.
 */
export function demangleName(expName: string) {
    let demangleAddress: NativePointer | null = Module.findExportByName("libc++.so", '__cxa_demangle')
    if (demangleAddress == null) demangleAddress = Module.findExportByName("libunwindstack.so", '__cxa_demangle')
    if (demangleAddress == null) demangleAddress = Module.findExportByName("libbacktrace.so", '__cxa_demangle')
    if (demangleAddress == null) demangleAddress = Module.findExportByName(null, '__cxa_demangle')
    if (demangleAddress == null) return ""
    let demangle = new NativeFunction(demangleAddress, 'pointer', ['pointer', 'pointer', 'pointer', 'pointer'])
    let mangledName: NativePointer = Memory.allocUtf8String(expName)
    let outputBuffer = NULL
    let length = NULL
    let status: NativePointer = Memory.alloc(p_size)
    let result: NativePointer = demangle(mangledName, outputBuffer, length, status)
    if (status.readInt() === 0) {
        let resultStr: string | null = result.readUtf8String()
        return (resultStr == null || resultStr == expName) ? "" : resultStr
    } else {
        return ""
    }
}

/**
 * 查找导入表
 * @param {string} moduleName 
 * @param {string} importName 
 * @returns 
 */
globalThis.findImport = (moduleName: string = "libc.so", importName: string = "") => {
    let md = Process.findModuleByName(moduleName)
    if (md == null) {
        LOGE("NOT FOUND Module : " + moduleName)
        return
    }
    md.enumerateImports().forEach((imp: ModuleImportDetails) => {
        if (!imp.name.includes(importName)) return
        let subAddr = (imp == undefined || imp!.address == null) ? "" : ` ( ${imp!.address!.sub(Process.findModuleByAddress(imp!.address)!.base)} )`
        LOGD(`\n[*] ${imp.type} -> address: ${imp.address}${subAddr}  | name: ${imp.name}`)
        let impMdBase = Process.findModuleByName(imp!.module!)?.base
        LOGZ(`\t${imp.module == undefined ? "" : (imp.module + " ( " + impMdBase + " ) ")} \t ${imp.slot == undefined ? "" : imp.slot}`)
    })
    newLine()
}

/**
 * 获取文件长度
 * @param filePath 文件路径
 * @returns 
 */
const getFileLenth = (filePath: string): number => {
    let file = callFunctionWithOutError(Module.findExportByName("libc.so", "fopen")!, allocCStr(filePath), allocCStr("rwx"))
    if (file.isNull()) return 0
    callFunctionWithOutError(Module.findExportByName("libc.so", "fseek")!, file, 0, 2)
    let len = callFunctionRI(Module.findExportByName("libc.so", "ftell")!, file)
    callFunctionWithOutError(Module.findExportByName("libc.so", "fclose")!, file)
    return len
}

globalThis.StalkerTraceEvent = (mPtr: NativePointer, range: NativePointer[] | undefined) => {
    let src_mPtr = mPtr
    mPtr = checkPointer(mPtr)
    if (mPtr == undefined || mPtr.isNull()) return
    const moduleG: Module | null = Process.findModuleByAddress(mPtr)
    if (moduleG == null) {
        LOGE(`Module not found { from ${mPtr}}`)
        return
    }
    if (range != undefined && range.length > 0) {
        for (let i = 0; i < range.length; i++) {
            range[i] = checkPointer(range[i])
        }
    }
    A(mPtr, (args: NativePointer[], _ctx: CpuContext, passValue: Map<PassType, any>) => {
        newLine()
        passValue.set("len", FM.printTitileA(`Enter ---> arg0:${args[0]}  arg1:${args[1]}  arg2:${args[2]}  arg3:${args[3]} | ${Process.getCurrentThreadId()}`, LogColor.YELLOW))
        stalkerEnter(Process.getCurrentThreadId())
    }, (ret: NativePointer, _ctx: CpuContext, passValue: Map<PassType, any>) => {
        LOGW(`${getLine(20)}\n Exit ---> ret : ${ret}\n${getLine(passValue.get("len"))}`)
        stalkerExit(Process.getCurrentThreadId())
    })
    LOGD(`Stalker Attached : ${mPtr} ( ${ptr(src_mPtr as unknown as number)} ) from ${moduleG.name} | ${Process.getCurrentThreadId()}`)

    function stalkerEnter(tid: ThreadId) {
        Stalker.follow(tid, {
            events: {
                call: true,
                ret: false,
                exec: false,
                block: false,
                compile: false
            },
            onReceive: function (events) {
                let msg: StalkerCallEventFull[] = Stalker.parse(events, {
                    annotate: true,     // 标注事件类型
                    stringify: false    // NativePointer 换为字符串
                }) as StalkerCallEventFull[]

                msg.forEach((event: StalkerCallEventFull) => {
                    let md1 = Process.findModuleByAddress(event[1] as NativePointer)
                    let md2 = Process.findModuleByAddress(event[2] as NativePointer)
                    let method_1 = AddressToMethodNoException(event[1] as NativePointer)
                    let method_2 = AddressToMethodNoException(event[2] as NativePointer)
                    if (method_1 != null) LOGW(`${method_1.name}`)
                    if (method_2 != null) LOGW(`${method_2.name}`)
                    LOGD(`${event[0]} Times:${event[3]} ${event[1]}@${md1?.name} ${event[2]}@${md2?.name} `)
                })
            }
        })
    }

    function stalkerExit(_tid: ThreadId) {
        Stalker.unfollow()
        Stalker.garbageCollect()
    }
}

/**
 * exp: StalkerTracePath(0x4CA23C,[0x4CA23C,0x4CA308])
 * @param {NativePointer} mPtr 
 * @param {NativePointer[] | undefined} range 
 * @returns 
 */
globalThis.StalkerTracePath = (mPtr: NativePointer, range: NativePointer[] | undefined) => {
    let src_mPtr: NativePointer = mPtr
    mPtr = checkPointer(mPtr)
    if (mPtr == undefined || mPtr.isNull()) return
    const moduleG: Module | null = Process.findModuleByAddress(mPtr)
    if (moduleG == null) {
        LOGE(`Module not found { from ${mPtr}}`)
        return
    }
    if (range != undefined && range.length > 0) {
        for (let i = 0; i < range.length; i++) {
            range[i] = checkPointer(range[i])
        }
    }
    A(mPtr, (args: NativePointer[], _ctx: CpuContext, passValue: Map<PassType, any>) => {
        newLine()
        passValue.set("len", FM.printTitileA(`Enter ---> arg0:${args[0]}  arg1:${args[1]}  arg2:${args[2]}  arg3:${args[3]} | ${Process.getCurrentThreadId()}`, LogColor.YELLOW))
        stalkerEnter(Process.getCurrentThreadId())
    }, (ret: NativePointer, _ctx: CpuContext, passValue: Map<PassType, any>) => {
        LOGW(`${getLine(20)}\n Exit ---> ret : ${ret}\n${getLine(passValue.get("len"))}`)
        stalkerExit(Process.getCurrentThreadId())
    })
    LOGD(`Stalker Attached : ${mPtr} ( ${ptr(src_mPtr as unknown as number)} ) from ${moduleG.name} | ${Process.getCurrentThreadId()}`)

    function stalkerEnter(tid: ThreadId) {
        let moduleMap = new ModuleMap((module) => {
            if (module.base.equals(moduleG!.base)) return true
            Stalker.exclude(module)
            return false
        })

        Stalker.follow(tid, {
            transform: (iterator: any | StalkerArmIterator | StalkerThumbIterator | StalkerArm64Iterator) => {
                let instruction = iterator.next()
                let isModuleCode = moduleMap.has(instruction.address)
                let subAddress = ptr(instruction.address)
                if (range != undefined) {
                    if (subAddress > range[0] && range[1] > subAddress)
                        LOGD(`[*] ${instruction.address} ( ${subAddress.sub(moduleG!.base)} ) ---> ${instruction.mnemonic} ${instruction.opStr}`)
                } else if (isModuleCode) {
                    LOGD(`[*] ${instruction.address} ( ${subAddress.sub(moduleG!.base)} ) ---> ${instruction.mnemonic} ${instruction.opStr}`)
                }
                do {
                    iterator.keep()
                } while (iterator.next() !== null)
            }
        })
    }

    function stalkerExit(tid: ThreadId) {
        Stalker.unfollow()
        Stalker.garbageCollect()
        LOGE("Stalker Exit : " + Process.getCurrentThreadId())
    }
}

///////// ↓ 测试代码 不用管 ↓ /////////

globalThis.cmdouleTest = () => {
    var source =
        "#include <stdio.h>" +
        "void functionFromCModule(){" +
        "   printf(\"Print from CModule\n\");" +
        "}";
    var cModule = new CModule(source);
    console.log(JSON.stringify(cModule));
    var ptrFunctionFromCModule = cModule['functionFromCModule'];
    var functionFromCModule = new NativeFunction(ptrFunctionFromCModule, 'void', []);
    functionFromCModule();
}

// globalThis.testBreak = () => {
//     const malloc = new NativeFunction(Module.findExportByName('libc.so', 'malloc')!, 'pointer', ['size_t']);
//     const memset = new NativeFunction(Module.findExportByName('libc.so', 'memset')!, 'pointer', ['pointer', 'size_t', 'int']);
//     const mprotect = new NativeFunction(Module.findExportByName('libc.so', 'mprotect')!, 'int', ['pointer', 'size_t', 'int']);
//     const free = new NativeFunction(Module.findExportByName('libc.so', 'free')!, 'void', ['pointer']);
//     function readwritebreak(addr: NativePointer, size: number, pattern: number) {

//         var point1 = addr - (addr % 0x1000)
//         console.log("set memcpy break : ", ptr(point1))

//         const mycode = malloc(0x1000)
//         mprotect(mycode, 0x1000, 7)
//         memset(mycode, 0x1000, 0)

//         //构建code
//         mycode.add(0x4).writeU32(0xD10943FF)//SUB SP ,SP ,#0x250
//         mycode.add(0x8).writeU32(0xA90077E8)//STP X8,X29,[SP]
//         mycode.add(0xc).writeU32(0xA90107E0)//STP X0 ,X1 ,[SP,#0x10]
//         mycode.add(0x10).writeU32(0xA9020FE2)//STP X2,X3,[SP,#0x20]
//         mycode.add(0x14).writeU32(0x58000760)//LDR X0 , [mycode,#0x100]
//         mycode.add(0x18).writeU32(0x58000781)//LDR X1 , [mycode,#0x108]
//         mycode.add(0x1C).writeU32(0x580007A2)//LDR X2 , [mycode,#0x110]
//         mycode.add(0x20).writeU32(0x580007C3)//LDR X3 , [mycode,#0x118]
//         mycode.add(0x24).writeU32(0xD63F0060)//BLR X3
//         mycode.add(0x28).writeU32(0xA9420FE2)//LDP X2, X3,[SP,#0x20]
//         mycode.add(0x2C).writeU32(0xA94107E0)//LDP X0, X1,[SP,#0x10]
//         mycode.add(0x30).writeU32(0xA94077E8)//LDP X8, X29,[SP]
//         mycode.add(0x34).writeU32(0x910943FF)//ADD SP, SP, #0x250
//         mycode.add(0x38).writeU32(0x5800075E)//LDR X30, [mycode,#0x120]
//         mycode.add(0x3C).writeU32(0xD65F03C0)//RET

//         //将point1,0x1000,pattern放入mycode+0x100
//         mycode.add(0x100).writePointer(ptr(point1))
//         mycode.add(0x108).writeU64(0x1000)
//         mycode.add(0x110).writeU64(pattern)
//         //mprotect函数存入0x118
//         mycode.add(0x118).writePointer(mprotect as NativePointer)
//         //修改目标内存页属性
//         mprotect(ptr(point1), 0x1000, pattern)

//         Process.setExceptionHandler(function (details: ExceptionDetails) {
//             if (details.type.indexOf("access-violation") >= 0) {
//                 var mempoint = details.memory!.address
//                 //判断是否是由自己修改内存导致的异常
//                 if (point1 <= mempoint && mempoint < point1 + 0x1000) {
//                     //是否命中我们关心的地址
//                     var off = ptr(mempoint).sub(addr)
//                     if (off >= 0 && off < size) {
//                         console.warn("命中 :", ptr(addr), " pc pointer : ", details.address)
//                         var module = Process.findModuleByAddress(ptr(details.context.pc));
//                         console.warn("pc - - > ", module.name, " -> ", ptr(details.context.pc).sub(module.base))
//                         mprotect(ptr(point1), 0x1000, 7)
//                         free(mycode)
//                         //console.error('RegisterNatives called from:\n' +Thread.backtrace(details.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n') + '\n');
//                         console.warn("readwritebreak exit")
//                         return true

//                     } else {
//                         console.log(details.memory.operation, "exce ;mpoint :", mempoint, ";pc -> ", ptr(details.context.pc), "; opcode :", ptr(ptr(details.context.pc).readU32()), "\n")
//                         //将内存页属性改回来
//                         mprotect(ptr(point1), 0x1000, 7)

//                         //将下一个code地址写入mycode+0x120处作为返回地址
//                         mycode.add(0x120).writePointer(ptr(details.context.pc).add(4))

//                         var thiscode = ptr(details.context.pc).readU32()
//                         var opcode = ((thiscode >> 24) & 0x3b)
//                         //三个pc偏移寻址共同位
//                         if (opcode == 24) {
//                             //将需要读取的数据存入mycode+0x128处
//                             mycode.add(0x128).writePointer(ptr(mempoint.readPointer()))
//                             mycode.add(0x130).writePointer(ptr(mempoint.add(8).readPointer()))
//                             //LDR Rn #pc+0x128
//                             var n_code = (thiscode & 0xFF00001F) | 0x940
//                             mycode.writeU32(n_code)
//                             details.context.pc = mycode
//                         } else {
//                             //将当前code写入mycode
//                             mycode.writeU32(ptr(details.context.pc).readU32())
//                             //直接修改pc
//                             details.context.pc = mycode
//                         }
//                         return true
//                     }
//                 }
//                 return false
//             }
//             return false
//         })
//     }
// }

function Arm64WriterUsingExample() {
    // mycode.add(0x4).writeU32(0xD10943FF)//SUB SP ,SP ,#0x250
    // mycode.add(0x8).writeU32(0xA90077E8)//STP X8,X29,[SP]
    // mycode.add(0xc).writeU32(0xA90107E0)//STP X0 ,X1 ,[SP,#0x10]

    let writer = new Arm64Writer(ptr(123))
    writer.putSubRegRegImm('sp', 'sp', 0x250)
    // type Arm64IndexMode = "post-adjust" | "signed-offset" | "pre-adjust";
    writer.putStpRegRegRegOffset('x8', 'x29', 'sp', 0, "post-adjust")
    writer.putStpRegRegRegOffset('x0', 'x1', 'sp', 0x10, "post-adjust")
    // mycode.add(0x10).writeU32(0xA9020FE2)//STP X2,X3,[SP,#0x20]
    // mycode.add(0x14).writeU32(0x58000760)//LDR X0 , [mycode,#0x100]
    // mycode.add(0x18).writeU32(0x58000781)//LDR X1 , [mycode,#0x108]
    writer.putStpRegRegRegOffset('x2', 'x3', 'sp', 0x20, "post-adjust")
    writer.putLdrRegRegOffset('x0', 'x0', 0x100)
    writer.putLdrRegRegOffset('x1', 'x0', 0x108)
    // mycode.add(0x1C).writeU32(0x580007A2)//LDR X2 , [mycode,#0x110]
    // mycode.add(0x20).writeU32(0x580007C3)//LDR X3 , [mycode,#0x118]
    // mycode.add(0x24).writeU32(0xD63F0060)//BLR X3
    writer.putLdrRegRegOffset('x2', 'x0', 0x110)
    writer.putLdrRegRegOffset('x3', 'x0', 0x118)
    writer.putBlrReg('x3')
    // mycode.add(0x28).writeU32(0xA9420FE2)//LDP X2, X3,[SP,#0x20]
    // mycode.add(0x2C).writeU32(0xA94107E0)//LDP X0, X1,[SP,#0x10]
    // mycode.add(0x30).writeU32(0xA94077E8)//LDP X8, X29,[SP]
    writer.putLdpRegRegRegOffset('x2', 'x3', 'sp', 0x20, "post-adjust")
    writer.putLdpRegRegRegOffset('x0', 'x1', 'sp', 0x10, "post-adjust")
    writer.putLdpRegRegRegOffset('x8', 'x29', 'sp', 0, "post-adjust")
    // mycode.add(0x34).writeU32(0x910943FF)//ADD SP, SP, #0x250
    // mycode.add(0x38).writeU32(0x5800075E)//LDR X30, [mycode,#0x120]
    // mycode.add(0x3C).writeU32(0xD65F03C0)//RET
    writer.putAddRegRegImm('sp', 'sp', 0x250)
    writer.putLdrRegRegOffset('x30', 'x0', 0x120)
    writer.putRet()

    writer.flush()

    Memory.patchCode(ptr(123), 0x40, (code: NativePointer) => {
        LOGD(code)
        let writer = new Arm64Writer(code)
        writer.putLabel('start')
        writer.putNop()
        writer.putCallAddressWithArguments(Module.findExportByName("libil2cpp.so", "il2cpp_string_new")!, ['x0', 0x10])
        LOGD(writer.base + " " + writer.pc + " " + writer.offset + " " + writer.code)
        writer.putBlrReg('lr')
        writer.putBCondLabel("eq", 'start')
        writer.flush()
    })
}

globalThis.patchTest = (mPtr: NativePointer, size: number = 1) => {
    Memory.patchCode(checkPointer(mPtr), Process.pageSize * size, (code: NativePointer) => {
        LOGD(code)
        let writer = new ArmWriter(code)
        writer.putLabel('start')
        writer.putNop()
        writer.putCallAddressWithArguments(Module.findExportByName("libil2cpp.so", "il2cpp_string_new")!, ['r10', 0x10])
        LOGD(writer.base + " " + writer.pc + " " + writer.offset + " " + writer.code)
        writer.putBlxReg('lr')
        writer.putBCondLabel("eq", 'start')
        writer.flush()
    })
}