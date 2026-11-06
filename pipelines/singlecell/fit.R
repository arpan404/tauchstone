# Only the caller-provided singlecell directory may receive outputs.
args <- commandArgs(TRUE)
root <- normalizePath(args[1], mustWork=TRUE)
stopifnot(basename(root) == 'singlecell')
source('pipelines/geo/R/common.R')
suppressPackageStartupMessages({library(edgeR); library(limma)})
meta <- read.delim(file.path(root, 'pseudobulk_samples.tsv'))
genes <- read.delim(file.path(root, 'genes.tsv'))
x <- as.matrix(read.delim(file.path(root, 'counts.tsv'), check.names=FALSE))
mapping <- map_symbols_to_entrez(genes$symbol)
ent <- mapping$entrez[match(genes$symbol, mapping$symbol)]
valid <- which(!is.na(ent))
ord <- valid[order(ent[valid], -rowMeans(x[valid,,drop=FALSE]))]
idx <- ord[!duplicated(ent[ord])]
versions <- list(org.Hs.eg.db=as.character(packageVersion('org.Hs.eg.db')), limma=as.character(packageVersion('limma')), edgeR=as.character(packageVersion('edgeR')))
jsonlite::write_json(versions, file.path(root, 'versions.json'), auto_unbox=TRUE)
for (key in unique(meta$signature_id)) {
 s <- meta[meta$signature_id == key & meta$n_nuclei >= 20, ]
 if (sum(s$diagnosis == 'AD') < 3 || sum(s$diagnosis == 'control') < 3) next
 group <- factor(s$diagnosis, levels=c('control','AD'))
 design <- model.matrix(~group)
 d <- DGEList(x[idx,s$column,drop=FALSE])
 d <- d[filterByExpr(d, design=design),,keep.lib.sizes=FALSE]
 d <- calcNormFactors(d, method='TMM')
 v <- voom(d, design, plot=FALSE)
 fit <- eBayes(lmFit(v, design), robust=TRUE)
 tt <- topTable(fit, coef='groupAD', number=Inf, sort.by='none')
 gi <- idx[as.integer(rownames(tt))]
 out <- data.frame(entrez_id=as.character(ent[gi]),symbol=genes$symbol[gi],ensembl=genes$ensembl[gi],log2fc=tt$logFC,stat=tt$t,p_value=tt$P.Value,fdr=tt$adj.P.Val,mean_expr=tt$AveExpr)
 write.table(out, file.path(root,paste0(gsub('|','__',key,fixed=TRUE),'.tsv')),sep='\t',row.names=FALSE,quote=FALSE)
}
